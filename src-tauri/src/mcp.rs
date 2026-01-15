use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Default)]
pub struct McpState {
    process: Mutex<Option<Child>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct McpStatus {
    pub running: bool,
    pub pid: Option<u32>,
}

/// Result of finding the MCP server - either a binary or a JS file requiring Node
enum McpServerPath {
    /// Standalone binary that can be executed directly
    Binary(std::path::PathBuf),
    /// JavaScript file that needs Node.js to run
    JavaScript(std::path::PathBuf),
}

/// Get the path to the MCP server (binary or JS)
fn get_mcp_server_path(_app: &AppHandle) -> Result<McpServerPath, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;

    // Navigate up from target/debug/milhouse to project root
    let project_root = exe_path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent());

    // In development, check for compiled binary first, then fall back to JS
    if let Some(root) = project_root {
        let dev_binary = root.join("mcp-server").join("dist").join("mcp-server");
        if dev_binary.exists() {
            return Ok(McpServerPath::Binary(dev_binary));
        }

        let dev_js = root.join("mcp-server").join("dist").join("index.js");
        if dev_js.exists() {
            return Ok(McpServerPath::JavaScript(dev_js));
        }
    }

    // Try bundled externalBin path (production)
    // Tauri places external binaries next to the main executable with target suffix
    let exe_dir = exe_path.parent()
        .ok_or_else(|| "Failed to get executable directory".to_string())?;

    // Get target triple for the binary name suffix
    let target_triple = std::env::consts::ARCH.to_string() + "-" +
        match std::env::consts::OS {
            "macos" => "apple-darwin",
            "windows" => "pc-windows-msvc",
            "linux" => "unknown-linux-gnu",
            os => os,
        };

    #[cfg(target_os = "windows")]
    let binary_name = format!("mcp-server-{}.exe", target_triple);
    #[cfg(not(target_os = "windows"))]
    let binary_name = format!("mcp-server-{}", target_triple);

    let binary_path = exe_dir.join(&binary_name);
    if binary_path.exists() {
        return Ok(McpServerPath::Binary(binary_path));
    }

    // Also try without suffix for development builds
    #[cfg(target_os = "windows")]
    let simple_binary = exe_dir.join("mcp-server.exe");
    #[cfg(not(target_os = "windows"))]
    let simple_binary = exe_dir.join("mcp-server");

    if simple_binary.exists() {
        return Ok(McpServerPath::Binary(simple_binary));
    }

    Err(format!("MCP server not found. Looked for: {}", binary_path.display()))
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
    let mcp_server = get_mcp_server_path(&app)?;

    // Start the MCP server process
    let child = match mcp_server {
        McpServerPath::Binary(path) => {
            Command::new(&path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start MCP server binary: {}", e))?
        }
        McpServerPath::JavaScript(path) => {
            Command::new("node")
                .arg(&path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start MCP server with Node: {}", e))?
        }
    };

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
