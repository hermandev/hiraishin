use tauri::State;

use crate::state::app_state::AppState;

#[tauri::command]
pub async fn crypto_encrypt(state: State<'_, AppState>, plain: String) -> Result<String, String> {
    state
        .crypto_service
        .encrypt(&plain)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn crypto_decrypt(state: State<'_, AppState>, cipher: String) -> Result<String, String> {
    state
        .crypto_service
        .decrypt(&cipher)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn crypto_hash_password(
    state: State<'_, AppState>,
    password: String,
    salt: Vec<u8>,
) -> Result<Vec<u8>, String> {
    state
        .crypto_service
        .hash_password(&password, &salt)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn crypto_verify_password(
    state: State<'_, AppState>,
    password: String,
    hash: Vec<u8>,
    salt: Vec<u8>,
) -> Result<bool, String> {
    state
        .crypto_service
        .verify_password(&password, &hash, &salt)
        .await
        .map_err(|e| e.to_string())
}
