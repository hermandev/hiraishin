use std::{collections::HashMap, sync::Arc};

use tokio::sync::Mutex;

use crate::domain::{
    repository::connection_repository::ConnectionRepository,
    services::{
        crypto_service::CryptoService,
        session_service::SshSession,
        ssh_service::{PortForwardTask, SshService},
    },
};

pub struct ActivePortForward {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub host: String,
    pub username: String,
    pub local_addr: String,
    pub remote_addr: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub task: PortForwardTask,
}

/// State global aplikasi yang dikelola Tauri.
/// Semua field adalah thread-safe (Send + Sync) karena dibungkus dengan Arc/Mutex.
pub struct AppState {
    /// Sesi SSH yang sedang aktif (key: session_id)
    pub active_sessions: Mutex<HashMap<String, Box<dyn SshSession>>>,

    /// Port forward aktif (key: forward_id)
    pub active_port_forwards: Mutex<HashMap<String, ActivePortForward>>,

    /// Service untuk operasi SSH (connect, exec, dll)
    pub ssh_service: Arc<dyn SshService>,

    /// Repository untuk menyimpan dan memuat koneksi
    pub connection_repo: Arc<dyn ConnectionRepository>,

    /// Service untuk enkripsi/dekripsi data sensitif
    pub crypto_service: Arc<dyn CryptoService>,
}

impl AppState {
    pub fn new(
        ssh_service: Arc<dyn SshService>,
        connection_repo: Arc<dyn ConnectionRepository>,
        crypto_service: Arc<dyn CryptoService>,
    ) -> Self {
        Self {
            active_sessions: Mutex::new(HashMap::new()),
            active_port_forwards: Mutex::new(HashMap::new()),
            ssh_service,
            connection_repo,
            crypto_service,
        }
    }

    /// Menambahkan sesi baru ke daftar aktif.
    pub async fn add_session(&self, session_id: String, session: Box<dyn SshSession>) {
        let mut sessions = self.active_sessions.lock().await;
        sessions.insert(session_id, session);
    }

    /// Menghapus sesi dari daftar aktif.
    pub async fn remove_session(&self, session_id: &str) -> Option<Box<dyn SshSession>> {
        let mut sessions = self.active_sessions.lock().await;
        sessions.remove(session_id)
    }

    pub async fn add_port_forward(&self, forward: ActivePortForward) {
        let mut forwards = self.active_port_forwards.lock().await;
        forwards.insert(forward.id.clone(), forward);
    }

    pub async fn remove_port_forward(&self, forward_id: &str) -> Option<ActivePortForward> {
        let mut forwards = self.active_port_forwards.lock().await;
        forwards.remove(forward_id)
    }
}
