use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProjectSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<std::collections::HashMap<String, McpServerConfig>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_start_claude: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ralph_wiggum_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub append_system_prompt: Option<String>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

/// Get the path to the project-specific Claude settings file
fn get_project_claude_settings_path(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".claude").join("settings.local.json")
}

/// Get the global Claude settings path
fn get_global_claude_settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}

#[tauri::command]
pub fn get_claude_project_settings(project_path: String) -> Result<ClaudeProjectSettings, String> {
    let local_path = get_project_claude_settings_path(&project_path);

    if local_path.exists() {
        let content = fs::read_to_string(&local_path)
            .map_err(|e| format!("Failed to read project settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse project settings: {}", e))
    } else {
        // Return default settings
        Ok(ClaudeProjectSettings::default())
    }
}

#[tauri::command]
pub fn save_claude_project_settings(
    project_path: String,
    settings: ClaudeProjectSettings,
) -> Result<(), String> {
    let local_path = get_project_claude_settings_path(&project_path);

    // Ensure .claude directory exists
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&local_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn initialize_project_claude(
    project_path: String,
    mcp_server_path: String,
) -> Result<ClaudeProjectSettings, String> {
    println!("[DEBUG] initialize_project_claude called");
    println!("[DEBUG]   project_path: {}", project_path);
    println!("[DEBUG]   mcp_server_path: {}", mcp_server_path);

    let local_path = get_project_claude_settings_path(&project_path);
    println!("[DEBUG]   settings path: {:?}", local_path);

    // Load existing settings or create default
    let mut settings = if local_path.exists() {
        println!("[DEBUG]   Loading existing settings");
        get_claude_project_settings(project_path.clone()).unwrap_or_default()
    } else {
        println!("[DEBUG]   Creating new settings");
        ClaudeProjectSettings::default()
    };

    // Register MCP server using claude mcp add command (this is the correct way to configure MCP)
    let mcp_dist_path = format!("{}/dist/index.js", mcp_server_path);
    println!("[DEBUG]   Registering MCP server via claude mcp add");

    // Use claude mcp add-json to add the server with proper configuration
    let mcp_config = serde_json::json!({
        "type": "stdio",
        "command": "node",
        "args": [mcp_dist_path],
        "env": {
            "MILHOUSE_PROJECT_PATH": project_path.clone()
        }
    });

    let add_result = std::process::Command::new("claude")
        .arg("mcp")
        .arg("add-json")
        .arg("milhouse-context")
        .arg(mcp_config.to_string())
        .arg("-s")  // scope to project
        .arg("project")
        .current_dir(&project_path)
        .output();

    match add_result {
        Ok(output) => {
            if output.status.success() {
                println!("[DEBUG]   MCP server registered successfully");
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // It's okay if it already exists
                if !stderr.contains("already exists") {
                    println!("[DEBUG]   MCP add warning: {}", stderr);
                }
            }
        }
        Err(e) => {
            println!("[DEBUG]   Failed to run claude mcp add: {}", e);
        }
    }

    // Also keep the settings in our local config for reference
    let mut env_vars = std::collections::HashMap::new();
    env_vars.insert("MILHOUSE_PROJECT_PATH".to_string(), project_path.clone());

    let mcp_server_entry = McpServerConfig {
        command: "node".to_string(),
        args: vec![format!("{}/dist/index.js", mcp_server_path)],
        env: Some(env_vars),
    };

    if let Some(ref mut servers) = settings.mcp_servers {
        servers.insert("milhouse-context".to_string(), mcp_server_entry);
    } else {
        let mut mcp_servers = std::collections::HashMap::new();
        mcp_servers.insert("milhouse-context".to_string(), mcp_server_entry);
        settings.mcp_servers = Some(mcp_servers);
    }

    // Ensure auto_start_claude is set
    if settings.auto_start_claude.is_none() {
        settings.auto_start_claude = Some(true);
    }

    // Always inject the Milhouse system prompt for memory/RAG capabilities
    let milhouse_prompt = r#"## Milhouse Context System

You have access to the Milhouse context system through the milhouse-context MCP server. This gives you persistent memory across conversations.

### IMPORTANT: Always use these tools:

1. **search_context** - ALWAYS search before answering questions about this project to find relevant past conversations, decisions, and code context. This helps you understand what has been done before.

2. **store_decision** - When making important architectural decisions, design choices, or discovering key insights, store them for future reference. Include the reasoning behind decisions.

3. **get_related_conversations** - When continuing previous work or referencing past discussions, search for related conversations to maintain continuity.

4. **get_project_summary** - Use this to get an overview of the project's history, recent activity, and key decisions when starting a new session.

5. **index_project** - If context seems stale or you can't find expected information, re-index the project to update the vector database.

### Best Practices:
- Search context BEFORE writing new code to check for existing patterns
- Store decisions with clear titles and detailed reasoning
- Reference past conversations when they're relevant to current work
- Maintain consistency with previous architectural decisions"#;

    settings.append_system_prompt = Some(milhouse_prompt.to_string());

    // Save the updated settings
    save_claude_project_settings(project_path, settings.clone())?;

    Ok(settings)
}

#[tauri::command]
pub fn check_claude_installed() -> bool {
    // Check if 'claude' command is available in PATH
    let result = std::process::Command::new("which")
        .arg("claude")
        .output()
        .map(|output| {
            let success = output.status.success();
            let path = String::from_utf8_lossy(&output.stdout);
            println!("[DEBUG] check_claude_installed: success={}, path={}", success, path.trim());
            success
        })
        .unwrap_or(false);
    println!("[DEBUG] check_claude_installed returning: {}", result);
    result
}

#[tauri::command]
pub fn check_mcp_registered(project_path: String) -> bool {
    // Check if milhouse-context MCP server is registered via claude mcp list
    let result = std::process::Command::new("claude")
        .arg("mcp")
        .arg("list")
        .current_dir(&project_path)
        .output();

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let is_registered = stdout.contains("milhouse-context") && stdout.contains("Connected");
            println!("[DEBUG] check_mcp_registered: {}", is_registered);
            is_registered
        }
        Err(e) => {
            println!("[DEBUG] check_mcp_registered error: {}", e);
            false
        }
    }
}

#[tauri::command]
pub fn get_mcp_server_path() -> Result<String, String> {
    // Get the path to the MCP server in the app bundle or development location
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;

    println!("[DEBUG] Executable path: {:?}", exe_path);

    // In development, the MCP server is in the project root
    // In production, it would be bundled with the app
    let dev_path = exe_path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.join("mcp-server"));

    println!("[DEBUG] Dev path: {:?}", dev_path);

    if let Some(ref path) = dev_path {
        println!("[DEBUG] Checking if path exists: {:?} -> {}", path, path.exists());
        if path.exists() {
            let result = path.to_string_lossy().to_string();
            println!("[DEBUG] Returning MCP path: {}", result);
            return Ok(result);
        }
    }

    // Fallback: try to find it relative to home directory
    if let Some(home) = dirs::home_dir() {
        let fallback = home.join(".milhouse").join("mcp-server");
        println!("[DEBUG] Fallback path: {:?} -> {}", fallback, fallback.exists());
        if fallback.exists() {
            return Ok(fallback.to_string_lossy().to_string());
        }
    }

    Err("MCP server not found".to_string())
}
