use std::any::Any;

use async_trait::async_trait;

use crate::domain::models::session::SessionMetadata;

#[async_trait]
pub trait SshSession: Send + Sync {
    /// ID unik sesi
    fn id(&self) -> &str;

    /// Metadata sesi (host, username, dll)
    fn metadata(&self) -> &SessionMetadata;

    /// Kirim data (input user) ke shell yang sedang berjalan.
    async fn send_data(
        &mut self,
        data: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;

    /// Baca data dari shell. Mengembalikan jumlah byte yang dibaca.
    async fn read_data(
        &mut self,
        buf: &mut [u8],
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>>;

    /// Resize terminal (PTY)
    async fn resize(
        &mut self,
        cols: u32,
        rows: u32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;

    /// Tutup sesi
    async fn close(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;

    /// Cek apakah sesi masih aktif
    fn is_active(&self) -> bool;

    /// Downcast ke tipe konkret (untuk keperluan internal, jika diperlukan)
    #[allow(dead_code)]
    fn as_any(&self) -> &dyn Any;
    #[allow(dead_code)]
    fn as_any_mut(&mut self) -> &mut dyn Any;
}
