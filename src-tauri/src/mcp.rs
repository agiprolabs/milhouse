use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct McpState {
    process: Mutex<Option<Child>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct McpStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

/// Get the path to the bundled MCP server
fn get_bundled_mcp_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // In development, use the mcp-server directory relative to the project
    // In production, use the bundled resources

    // Try development path first
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;

    // Navigate up from target/debug/milhouse to project root
    let dev_path = exe_path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.join("mcp-server").join("dist").join("index.js"));

    if let Some(path) = dev_path {
        if path.exists() {
            return Ok(path);
        }
    }

    // Try bundled resources path
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("index.js");

    if resource_path.exists() {
        return Ok(resource_path);
    }

    Err("MCP server not found in development or bundled locations".to_string())
}

#[tauri::command]
pub fn start_mcp_server(app: AppHandle, state: tauri::State<McpState>) -> Result<McpStatus, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    // Check if already running
    if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process has exited, clear it
                *process_guard = None;
            }
            Ok(None) => {
                // Still running
                return Ok(McpStatus {
                    running: true,
                    pid: Some(child.id()),
                });
            }
            Err(e) => {
                return Err(format!("Failed to check process status: {}", e));
            }
        }
    }

    // Get the MCP server path
    let mcp_path = get_bundled_mcp_path(&app)?;

    // Start the MCP server process
    let child = Command::new("node")
        .arg(&mcp_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start MCP server: {}", e))?;

    let pid = child.id();
    *process_guard = Some(child);

    Ok(McpStatus {
        running: true,
        pid: Some(pid),
    })
}

#[tauri::command]
pub fn stop_mcp_server(state: tauri::State<McpState>) -> Result<McpStatus, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *process_guard {
        // Try graceful termination first
        match child.kill() {
            Ok(_) => {
                // Wait for the process to actually terminate
                let _ = child.wait();
            }
            Err(e) => {
                return Err(format!("Failed to stop MCP server: {}", e));
            }
        }
    }

    *process_guard = None;

    Ok(McpStatus {
        running: false,
        pid: None,
    })
}

#[tauri::command]
pub fn get_mcp_status(state: tauri::State<McpState>) -> Result<McpStatus, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process has exited
                *process_guard = None;
                Ok(McpStatus {
                    running: false,
                    pid: None,
                })
            }
            Ok(None) => {
                // Still running
                Ok(McpStatus {
                    running: true,
                    pid: Some(child.id()),
                })
            }
            Err(e) => Err(format!("Failed to check process status: {}", e)),
        }
    } else {
        Ok(McpStatus {
            running: false,
            pid: None,
        })
    }
}
