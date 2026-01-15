use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
}

/// List tasks from the context store
/// Note: This is a stub implementation. In production, this would connect to
/// the LanceDB database at ~/.milhouse/context.lance
#[tauri::command]
pub fn list_tasks(project_path: Option<String>) -> Result<Vec<TaskEntry>, String> {
    // TODO: Implement actual LanceDB query
    // For now, return empty array - the MCP server handles the actual data storage
    // and Claude can use the list_tasks MCP tool to query tasks
    println!("[DEBUG] list_tasks called with project_path: {:?}", project_path);
    Ok(vec![])
}

/// List documents from the context store
/// Note: This is a stub implementation. In production, this would connect to
/// the LanceDB database at ~/.milhouse/context.lance
#[tauri::command]
pub fn list_documents(project_path: Option<String>) -> Result<Vec<DocumentEntry>, String> {
    // TODO: Implement actual LanceDB query
    // For now, return empty array - the MCP server handles the actual data storage
    // and Claude can use the list_documents MCP tool to query documents
    println!("[DEBUG] list_documents called with project_path: {:?}", project_path);
    Ok(vec![])
}

/// Update task status in the context store
/// Note: This is a stub implementation. In production, this would update
/// the LanceDB database at ~/.milhouse/context.lance
#[tauri::command]
pub fn update_task_status(task_id: String, status: String) -> Result<(), String> {
    // TODO: Implement actual LanceDB update
    // For now, just log the request - the MCP server handles the actual data
    // and Claude can use the update_task_status MCP tool to update tasks
    println!("[DEBUG] update_task_status called: task_id={}, status={}", task_id, status);
    Ok(())
}
