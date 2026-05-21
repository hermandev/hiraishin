use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::{
    domain::models::connections::{Connection, SavedScript, ScriptRunInfo, ScriptRunStatus},
    state::app_state::{ActiveScriptRun, AppState},
};

const EXIT_MARKER: &str = "__HIRAISHIN_SCRIPT_EXIT__:";

#[derive(Debug, Deserialize)]
pub struct SaveScriptRequest {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub connection_id: String,
    pub script: String,
}

#[derive(Debug, Serialize)]
pub struct ScriptRunRead {
    pub output: String,
    pub info: ScriptRunInfo,
}

fn build_script_command(script: &str) -> String {
    format!(
        "PS4='+ line ${{LINENO}}: ' bash -xse <<'__HIRAISHIN_SCRIPT__'\n{}\n__HIRAISHIN_SCRIPT__\nprintf '\\n{}%s\\n' \"$?\"\n",
        script, EXIT_MARKER
    )
}

fn parse_exit_code(output: &str) -> Option<i32> {
    output[output.find(EXIT_MARKER)? + EXIT_MARKER.len()..]
        .lines()
        .next()
        .map(str::trim)
        .and_then(|code| code.parse::<i32>().ok())
}

fn visible_output(output: &str) -> &str {
    output
        .find(EXIT_MARKER)
        .map(|index| &output[..index])
        .unwrap_or(output)
}

#[tauri::command]
pub async fn script_save(
    state: State<'_, AppState>,
    request: SaveScriptRequest,
) -> Result<SavedScript, String> {
    let connection = state
        .connection_repo
        .get_connection(&request.connection_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("connection not found: {}", request.connection_id))?;
    let now = chrono::Utc::now();
    let existing = match request.id.as_deref() {
        Some(id) => state
            .connection_repo
            .get_script(id)
            .await
            .map_err(|e| e.to_string())?,
        None => None,
    };
    let script = SavedScript {
        id: existing
            .as_ref()
            .map(|script| script.id.clone())
            .or(request.id)
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: request.name.trim().to_string(),
        description: request
            .description
            .and_then(|value| (!value.trim().is_empty()).then(|| value.trim().to_string())),
        connection_id: connection.id,
        connection_name: connection.name,
        script: request.script,
        created_at: existing
            .as_ref()
            .map(|script| script.created_at)
            .unwrap_or(now),
        updated_at: now,
        last_run_at: existing.and_then(|script| script.last_run_at),
    };
    state
        .connection_repo
        .save_script(&script)
        .await
        .map_err(|e| e.to_string())?;
    Ok(script)
}

#[tauri::command]
pub async fn script_list(state: State<'_, AppState>) -> Result<Vec<SavedScript>, String> {
    state
        .connection_repo
        .get_all_scripts()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn script_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .connection_repo
        .delete_script(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn script_start(
    state: State<'_, AppState>,
    script_id: String,
) -> Result<ScriptRunInfo, String> {
    let mut script = state
        .connection_repo
        .get_script(&script_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("script not found: {script_id}"))?;
    let connection: Connection = state
        .connection_repo
        .get_connection(&script.connection_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("connection not found: {}", script.connection_id))?;
    let command = build_script_command(&script.script);
    let session = state
        .ssh_service
        .exec_session(connection.config, &command)
        .await
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    script.last_run_at = Some(now);
    script.updated_at = now;
    state
        .connection_repo
        .save_script(&script)
        .await
        .map_err(|e| e.to_string())?;

    let info = ScriptRunInfo {
        id: Uuid::new_v4().to_string(),
        script_id: script.id,
        script_name: script.name,
        connection_id: script.connection_id,
        connection_name: script.connection_name,
        started_at: now,
        finished_at: None,
        status: ScriptRunStatus::Running,
        exit_code: None,
    };
    state
        .add_script_run(
            info.id.clone(),
            ActiveScriptRun {
                info: info.clone(),
                output: String::new(),
                sent_len: 0,
                session,
            },
        )
        .await;
    Ok(info)
}

#[tauri::command]
pub async fn script_read_run(
    state: State<'_, AppState>,
    run_id: String,
    max_len: usize,
) -> Result<ScriptRunRead, String> {
    let mut runs = state.active_script_runs.lock().await;
    let run = runs
        .get_mut(&run_id)
        .ok_or_else(|| format!("script run not found: {run_id}"))?;
    let mut buffer = vec![0_u8; max_len.max(1)];
    let read = run
        .session
        .read_data(&mut buffer)
        .await
        .map_err(|e| e.to_string())?;
    buffer.truncate(read);
    let raw_output = String::from_utf8_lossy(&buffer).to_string();
    run.output.push_str(&raw_output);

    if let Some(exit_code) = parse_exit_code(&run.output) {
        run.info.exit_code = Some(exit_code);
        run.info.finished_at = Some(chrono::Utc::now());
        run.info.status = if exit_code == 0 {
            ScriptRunStatus::Success
        } else {
            ScriptRunStatus::Failed
        };
        let _ = run.session.close().await;
    } else if !run.session.is_active() {
        run.info.finished_at = Some(chrono::Utc::now());
        run.info.status = ScriptRunStatus::Failed;
    }

    let visible = visible_output(&run.output);
    let output = visible.get(run.sent_len..).unwrap_or_default().to_string();
    run.sent_len = visible.len();
    let info = run.info.clone();
    if info.status != ScriptRunStatus::Running {
        runs.remove(&run_id);
    }

    Ok(ScriptRunRead { output, info })
}

#[tauri::command]
pub async fn script_stop_run(state: State<'_, AppState>, run_id: String) -> Result<(), String> {
    let mut run = state
        .remove_script_run(&run_id)
        .await
        .ok_or_else(|| format!("script run not found: {run_id}"))?;
    run.session.close().await.map_err(|e| e.to_string())
}
