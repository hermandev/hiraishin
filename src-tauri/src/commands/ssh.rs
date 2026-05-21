use tauri::State;

use std::collections::HashSet;

use serde::Serialize;
use uuid::Uuid;

use crate::{
    domain::models::{
        connections::{Connection, PortForwardStatus, SavedPortForward, SshConfig},
        session::SessionMetadata,
    },
    state::app_state::{ActivePortForward, AppState},
};

#[derive(Serialize)]
pub struct SessionInfo {
    metadata: SessionMetadata,
    active: bool,
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
    label: String,
    local_addr: String,
    remote_addr: String,
) -> Result<SavedPortForward, String> {
    let now = chrono::Utc::now();
    let forward_id = Uuid::new_v4().to_string();
    let task = state
        .ssh_service
        .local_port_forward(connection.config.clone(), &local_addr, &remote_addr)
        .await
        .map_err(|e| e.to_string())?;

    let saved = SavedPortForward {
        id: forward_id,
        label: if label.trim().is_empty() {
            format!("{local_addr} -> {remote_addr}")
        } else {
            label.trim().to_string()
        },
        connection_id: connection.id.clone(),
        connection_name: connection.name,
        host: connection.config.host,
        username: connection.config.credential.username,
        local_addr,
        remote_addr,
        created_at: now,
        last_started_at: Some(now),
        last_stopped_at: None,
        status: PortForwardStatus::Connected,
    };
    state
        .connection_repo
        .save_port_forward(&saved)
        .await
        .map_err(|e| e.to_string())?;

    let active = ActivePortForward {
        id: saved.id.clone(),
        task,
    };
    state.add_port_forward(active).await;
    Ok(saved)
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

    if let Some(mut saved) = state
        .connection_repo
        .get_port_forward(&forward_id)
        .await
        .map_err(|e| e.to_string())?
    {
        saved.status = PortForwardStatus::Disconnected;
        saved.last_stopped_at = Some(chrono::Utc::now());
        state
            .connection_repo
            .save_port_forward(&saved)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn ssh_connect_saved_local_port_forward(
    state: State<'_, AppState>,
    forward_id: String,
) -> Result<SavedPortForward, String> {
    {
        let active = state.active_port_forwards.lock().await;
        if active.contains_key(&forward_id) {
            return Err(format!("port forward already connected: {forward_id}"));
        }
    }

    let mut saved = state
        .connection_repo
        .get_port_forward(&forward_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("port forward not found: {forward_id}"))?;
    let connection = state
        .connection_repo
        .get_connection(&saved.connection_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("connection not found: {}", saved.connection_id))?;
    let task = state
        .ssh_service
        .local_port_forward(
            connection.config,
            saved.local_addr.as_str(),
            saved.remote_addr.as_str(),
        )
        .await
        .map_err(|e| e.to_string())?;

    saved.last_started_at = Some(chrono::Utc::now());
    saved.status = PortForwardStatus::Connected;
    state
        .connection_repo
        .save_port_forward(&saved)
        .await
        .map_err(|e| e.to_string())?;
    state
        .add_port_forward(ActivePortForward {
            id: saved.id.clone(),
            task,
        })
        .await;
    Ok(saved)
}

#[tauri::command]
pub async fn ssh_list_local_port_forwards(
    state: State<'_, AppState>,
) -> Result<Vec<SavedPortForward>, String> {
    let forwards = state.active_port_forwards.lock().await;
    let active_ids = forwards.keys().cloned().collect::<HashSet<_>>();
    drop(forwards);

    let mut saved = state
        .connection_repo
        .get_all_port_forwards()
        .await
        .map_err(|e| e.to_string())?;
    for forward in &mut saved {
        forward.status = if active_ids.contains(&forward.id) {
            PortForwardStatus::Connected
        } else {
            PortForwardStatus::Disconnected
        };
    }
    Ok(saved)
}

#[tauri::command]
pub async fn ssh_delete_local_port_forward(
    state: State<'_, AppState>,
    forward_id: String,
) -> Result<(), String> {
    if let Some(forward) = state.remove_port_forward(&forward_id).await {
        let _ = forward.task.shutdown.send(true);
        forward.task.handle.abort();
    }
    state
        .connection_repo
        .delete_port_forward(&forward_id)
        .await
        .map_err(|e| e.to_string())
}
