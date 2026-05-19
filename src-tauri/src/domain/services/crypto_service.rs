use async_trait::async_trait;

use crate::domain::services::CryptoResult;

#[async_trait]
pub trait CryptoService: Send + Sync {
    /// Enkripsi plain text menjadi cipher text (hex atau base64).
    async fn encrypt(&self, plain: &str) -> CryptoResult<String>;

    /// Dekripsi cipher text menjadi plain text.
    async fn decrypt(&self, cipher: &str) -> CryptoResult<String>;

    /// Hash password (misal untuk master password)
    async fn hash_password(&self, password: &str, salt: &[u8]) -> CryptoResult<Vec<u8>>;

    /// Verifikasi password
    async fn verify_password(&self, password: &str, hash: &[u8], salt: &[u8])
        -> CryptoResult<bool>;
}
