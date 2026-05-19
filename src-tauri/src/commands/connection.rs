use tauri::State;

use crate::{
    domain::models::connections::{Connection, Group},
    state::app_state::AppState,
};

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppState>,
    connection: Connection,
) -> Result<(), String> {
    state
        .connection_repo
        .save_connection(&connection)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_connections(state: State<'_, AppState>) -> Result<Vec<Connection>, String> {
    state
        .connection_repo
        .get_all_connections()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Connection>, String> {
    state
        .connection_repo
        .get_connection(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_connection(
    state: State<'_, AppState>,
    connection: Connection,
) -> Result<(), String> {
    state
        .connection_repo
        .update_connection(&connection)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .connection_repo
        .delete_connection(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connections_by_group(
    state: State<'_, AppState>,
    group_id: String,
) -> Result<Vec<Connection>, String> {
    state
        .connection_repo
        .get_connections_by_group(&group_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_connections(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Connection>, String> {
    state
        .connection_repo
        .search_connections(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_group(state: State<'_, AppState>, group: Group) -> Result<(), String> {
    state
        .connection_repo
        .save_group(&group)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_group(state: State<'_, AppState>, id: String) -> Result<Option<Group>, String> {
    state
        .connection_repo
        .get_group(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_groups(state: State<'_, AppState>) -> Result<Vec<Group>, String> {
    state
        .connection_repo
        .get_all_groups()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_group(state: State<'_, AppState>, group: Group) -> Result<(), String> {
    state
        .connection_repo
        .update_group(&group)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_group(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .connection_repo
        .delete_group(&id)
        .await
        .map_err(|e| e.to_string())
}
