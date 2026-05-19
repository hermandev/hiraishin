use tauri::State;

use serde::Serialize;
use uuid::Uuid;

use crate::{
    domain::models::{connections::Connection, connections::SshConfig, session::SessionMetadata},
    state::app_state::{ActivePortForward, AppState},
};

#[derive(Serialize)]
pub struct SessionInfo {
    metadata: SessionMetadata,
    active: bool,
}

#[derive(Clone, Serialize)]
pub struct PortForwardInfo {
    id: String,
    connection_id: String,
    connection_name: String,
    host: String,
    username: String,
    local_addr: String,
    remote_addr: String,
    started_at: String,
}

impl From<&ActivePortForward> for PortForwardInfo {
    fn from(forward: &ActivePortForward) -> Self {
        Self {
            id: forward.id.clone(),
            connection_id: forward.connection_id.clone(),
            connection_name: forward.connection_name.clone(),
            host: forward.host.clone(),
            username: forward.username.clone(),
            local_addr: forward.local_addr.clone(),
            remote_addr: forward.remote_addr.clone(),
            started_at: forward.started_at.to_rfc3339(),
        }
    }
}

#[tauri::command]
pub async fn ssh_test_connection(
    state: State<'_, AppState>,
    config: SshConfig,
) -> Result<bool, String> {
    state
        .ssh_service
        .test_connection(config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_exec_command(
    state: State<'_, AppState>,
    config: SshConfig,
    command: String,
) -> Result<String, String> {
    state
        .ssh_service
        .exec_command(config, &command)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_open_session(
    state: State<'_, AppState>,
    config: SshConfig,
) -> Result<String, String> {
    let session = state
        .ssh_service
        .connect(config)
        .await
        .map_err(|e| e.to_string())?;
    let session_id = session.id().to_string();
    state.add_session(session_id.clone(), session).await;
    Ok(session_id)
}

#[tauri::command]
pub async fn ssh_send_data(
    state: State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = state.active_sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session.send_data(&data).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_read_data(
    state: State<'_, AppState>,
    session_id: String,
    max_len: usize,
) -> Result<Vec<u8>, String> {
    let mut sessions = state.active_sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    let mut buffer = vec![0_u8; max_len.max(1)];
    let read = session
        .read_data(&mut buffer)
        .await
        .map_err(|e| e.to_string())?;
    buffer.truncate(read);
    Ok(buffer)
}

#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let mut sessions = state.active_sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session.resize(cols, rows).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_close_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let mut session = state
        .remove_session(&session_id)
        .await
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    session.close().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_session_info(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionInfo, String> {
    let sessions = state.active_sessions.lock().await;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("session not found: {session_id}"))?;
    Ok(SessionInfo {
        metadata: session.metadata().clone(),
        active: session.is_active(),
    })
}

#[tauri::command]
pub async fn ssh_start_local_port_forward(
    state: State<'_, AppState>,
    connection: Connection,
    local_addr: String,
    remote_addr: String,
) -> Result<PortForwardInfo, String> {
    let task = state
        .ssh_service
        .local_port_forward(connection.config.clone(), &local_addr, &remote_addr)
        .await
        .map_err(|e| e.to_string())?;

    let forward = ActivePortForward {
        id: Uuid::new_v4().to_string(),
        connection_id: connection.id,
        connection_name: connection.name,
        host: connection.config.host,
        username: connection.config.credential.username,
        local_addr,
        remote_addr,
        started_at: chrono::Utc::now(),
        task,
    };
    let info = PortForwardInfo::from(&forward);
    state.add_port_forward(forward).await;
    Ok(info)
}

#[tauri::command]
pub async fn ssh_stop_local_port_forward(
    state: State<'_, AppState>,
    forward_id: String,
) -> Result<(), String> {
    let forward = state
        .remove_port_forward(&forward_id)
        .await
        .ok_or_else(|| format!("port forward not found: {forward_id}"))?;
    let _ = forward.task.shutdown.send(true);
    forward.task.handle.abort();
    Ok(())
}

#[tauri::command]
pub async fn ssh_list_local_port_forwards(
    state: State<'_, AppState>,
) -> Result<Vec<PortForwardInfo>, String> {
    let forwards = state.active_port_forwards.lock().await;
    Ok(forwards.values().map(PortForwardInfo::from).collect())
}
