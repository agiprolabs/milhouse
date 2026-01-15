mod claude;
mod drawer;
mod files;
mod mcp;
mod terminal;

use claude::{
    check_claude_installed, check_mcp_registered, get_claude_project_settings, get_mcp_server_path,
    initialize_project_claude, save_claude_project_settings,
};
use drawer::{list_documents, list_tasks, update_task_status};
use files::{get_home_dir, read_directory, read_file};
use mcp::{get_mcp_status, start_mcp_server, stop_mcp_server, McpState};
use terminal::{create_terminal, kill_terminal, list_terminals, resize_terminal, write_terminal, TerminalState};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Milhouse.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(TerminalState::default())
        .manage(McpState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_directory,
            read_file,
            get_home_dir,
            create_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            list_terminals,
            get_claude_project_settings,
            save_claude_project_settings,
            initialize_project_claude,
            check_claude_installed,
            check_mcp_registered,
            get_mcp_server_path,
            start_mcp_server,
            stop_mcp_server,
            get_mcp_status,
            list_tasks,
            list_documents,
            update_task_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
