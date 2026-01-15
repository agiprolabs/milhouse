use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtyPair};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct TerminalInstance {
    pub pty_pair: PtyPair,
    pub writer: Box<dyn Write + Send>,
}

pub struct TerminalState {
    pub terminals: Arc<Mutex<HashMap<String, TerminalInstance>>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct TerminalOutput {
    pub id: String,
    pub data: String,
}

#[tauri::command]
pub fn create_terminal(
    state: State<'_, TerminalState>,
    app: AppHandle,
    cwd: Option<String>,
    startup_command: Option<String>,
) -> Result<String, String> {
    println!("[DEBUG] create_terminal called:");
    println!("[DEBUG]   cwd: {:?}", cwd);
    println!("[DEBUG]   startup_command: {:?}", startup_command);

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {}", e))?;

    let mut cmd = CommandBuilder::new_default_prog();

    // Ensure PATH includes ~/.local/bin where claude is typically installed
    if let Some(home) = dirs::home_dir() {
        let local_bin = home.join(".local/bin");
        if let Ok(current_path) = std::env::var("PATH") {
            let new_path = format!("{}:{}", local_bin.display(), current_path);
            cmd.env("PATH", new_path);
            println!("[DEBUG] Set PATH to include ~/.local/bin");
        }
    }

    let _working_dir = if let Some(ref dir) = cwd {
        cmd.cwd(dir);
        Some(dir.clone())
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(&home);
        home.to_str().map(|s| s.to_string())
    } else {
        None
    };

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let terminal_id = Uuid::new_v4().to_string();
    let id_clone = terminal_id.clone();

    // Get reader for output
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Get writer for input
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Store the terminal instance
    {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.insert(
            terminal_id.clone(),
            TerminalInstance {
                pty_pair: pair,
                writer,
            },
        );
    }

    // Spawn thread to read output and emit events
    let app_clone = app.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    // Skip empty data
                    if !data.is_empty() {
                        let _ = app_clone.emit(
                            "terminal-output",
                            TerminalOutput {
                                id: id_clone.clone(),
                                data,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Spawn thread to wait for process exit
    let terminal_id_for_exit = terminal_id.clone();
    let app_for_exit = app.clone();
    thread::spawn(move || {
        let _ = child.wait();
        let _ = app_for_exit.emit("terminal-exit", terminal_id_for_exit);
    });

    // If a startup command is provided, send it after a brief delay
    if let Some(cmd_to_run) = startup_command {
        println!("[DEBUG] Spawning thread to execute startup command: {}", cmd_to_run);
        let state_clone = state.terminals.clone();
        let terminal_id_for_cmd = terminal_id.clone();
        thread::spawn(move || {
            // Wait for shell to initialize and terminal to be resized
            // This needs enough time for:
            // 1. Shell to load profile (adds ~/.local/bin to PATH)
            // 2. Frontend to initialize xterm and fit addon
            // 3. Resize event to be sent to PTY
            println!("[DEBUG] Startup command thread: waiting 2000ms for shell and resize...");
            thread::sleep(std::time::Duration::from_millis(2000));

            println!("[DEBUG] Startup command thread: attempting to acquire lock...");
            let mut terminals = state_clone.lock().unwrap();
            println!("[DEBUG] Startup command thread: lock acquired, looking for terminal {}", terminal_id_for_cmd);
            if let Some(terminal) = terminals.get_mut(&terminal_id_for_cmd) {
                // Send the command with newline
                let cmd_with_newline = format!("{}\n", cmd_to_run);
                println!("[DEBUG] Startup command thread: writing command to terminal: {:?}", cmd_with_newline);
                match terminal.writer.write_all(cmd_with_newline.as_bytes()) {
                    Ok(_) => println!("[DEBUG] Startup command thread: write successful"),
                    Err(e) => println!("[DEBUG] Startup command thread: write failed: {}", e),
                }
                match terminal.writer.flush() {
                    Ok(_) => println!("[DEBUG] Startup command thread: flush successful"),
                    Err(e) => println!("[DEBUG] Startup command thread: flush failed: {}", e),
                }
            } else {
                println!("[DEBUG] Startup command thread: terminal {} not found!", terminal_id_for_cmd);
            }
        });
    }

    Ok(terminal_id)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();

    if let Some(terminal) = terminals.get_mut(&id) {
        terminal
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to terminal: {}", e))?;
        terminal
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush terminal: {}", e))?;
        Ok(())
    } else {
        Err(format!("Terminal not found: {}", id))
    }
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, TerminalState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    println!("[DEBUG] resize_terminal called: id={}, cols={}, rows={}", &id[..8], cols, rows);
    let terminals = state.terminals.lock().unwrap();

    if let Some(terminal) = terminals.get(&id) {
        terminal
            .pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize terminal: {}", e))?;
        println!("[DEBUG] resize_terminal success: {}x{}", cols, rows);
        Ok(())
    } else {
        Err(format!("Terminal not found: {}", id))
    }
}

#[tauri::command]
pub fn kill_terminal(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();

    if terminals.remove(&id).is_some() {
        Ok(())
    } else {
        Err(format!("Terminal not found: {}", id))
    }
}

#[tauri::command]
pub fn list_terminals(state: State<'_, TerminalState>) -> Vec<String> {
    let terminals = state.terminals.lock().unwrap();
    terminals.keys().cloned().collect()
}
