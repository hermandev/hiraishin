pub mod crypto_service;
pub mod session_service;
pub mod ssh_service;

pub type SshResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub type CryptoResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
