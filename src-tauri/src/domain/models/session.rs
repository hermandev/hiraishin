use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SessionMetadata {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}
