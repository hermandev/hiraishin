use async_trait::async_trait;
use tokio::{sync::watch, task::JoinHandle};

use crate::domain::{
    models::connections::SshConfig,
    services::{session_service::SshSession, SshResult},
};

pub struct PortForwardTask {
    pub shutdown: watch::Sender<bool>,
    pub handle: JoinHandle<()>,
}

#[async_trait]
pub trait SshService: Send + Sync {
    /// Membuka koneksi SSH baru dan memulai shell.
    async fn connect(&self, config: SshConfig) -> SshResult<Box<dyn SshSession>>;

    /// Membuka session untuk command tunggal (non-interaktif)
    async fn exec_command(&self, config: SshConfig, command: &str) -> SshResult<String>;

    /// Membuka session command non-interaktif yang output-nya bisa dibaca bertahap.
    async fn exec_session(
        &self,
        config: SshConfig,
        command: &str,
    ) -> SshResult<Box<dyn SshSession>>;

    /// Test koneksi (handshake + auth) tanpa membuka shell.
    async fn test_connection(&self, config: SshConfig) -> SshResult<bool>;

    /// Membuka port forward lokal (optional)
    async fn local_port_forward(
        &self,
        config: SshConfig,
        local_addr: &str,
        remote_addr: &str,
    ) -> SshResult<PortForwardTask>;
}
