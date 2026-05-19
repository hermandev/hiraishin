use std::{fs, path::Path};

use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::domain::services::{crypto_service::CryptoService, CryptoResult};

const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const HASH_LEN: usize = 32;
const FORMAT_VERSION: u8 = 1;

pub struct AesGcmCryptoService {
    key: [u8; KEY_LEN],
}

impl AesGcmCryptoService {
    pub fn new(key: [u8; KEY_LEN]) -> Self {
        Self { key }
    }

    pub fn generate() -> Self {
        let mut key = [0_u8; KEY_LEN];
        OsRng.fill_bytes(&mut key);
        Self::new(key)
    }

    pub fn load_or_create(path: impl AsRef<Path>) -> CryptoResult<Self> {
        let path = path.as_ref();
        if !path.exists() {
            let legacy_path = path.with_file_name("crypto.key");
            if legacy_path.exists() {
                fs::rename(&legacy_path, path)?;
            }
        }

        if path.exists() {
            let encoded = fs::read_to_string(path)?;
            let key = STANDARD.decode(encoded.trim())?;
            return Self::from_key_slice(&key);
        }

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let service = Self::generate();
        fs::write(path, STANDARD.encode(service.key))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
        }

        Ok(service)
    }

    pub fn from_key_slice(key: &[u8]) -> CryptoResult<Self> {
        let key: [u8; KEY_LEN] = key
            .try_into()
            .map_err(|_| anyhow::anyhow!("crypto key must be {KEY_LEN} bytes"))?;
        Ok(Self::new(key))
    }

    fn cipher(&self) -> CryptoResult<Aes256Gcm> {
        Aes256Gcm::new_from_slice(&self.key).map_err(|e| anyhow::anyhow!(e).into())
    }
}

#[async_trait]
impl CryptoService for AesGcmCryptoService {
    async fn encrypt(&self, plain: &str) -> CryptoResult<String> {
        let cipher = self.cipher()?;
        let mut nonce = [0_u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);

        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
            .map_err(|e| anyhow::anyhow!(e))?;

        let mut payload = Vec::with_capacity(1 + NONCE_LEN + ciphertext.len());
        payload.push(FORMAT_VERSION);
        payload.extend_from_slice(&nonce);
        payload.extend_from_slice(&ciphertext);

        Ok(STANDARD.encode(payload))
    }

    async fn decrypt(&self, cipher_text: &str) -> CryptoResult<String> {
        let payload = STANDARD.decode(cipher_text)?;
        if payload.len() <= 1 + NONCE_LEN {
            return Err(anyhow::anyhow!("cipher text payload is too short").into());
        }
        if payload[0] != FORMAT_VERSION {
            return Err(anyhow::anyhow!("unsupported cipher text version").into());
        }

        let nonce = Nonce::from_slice(&payload[1..1 + NONCE_LEN]);
        let ciphertext = &payload[1 + NONCE_LEN..];
        let plain = self
            .cipher()?
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!(e))?;

        String::from_utf8(plain).map_err(Into::into)
    }

    async fn hash_password(&self, password: &str, salt: &[u8]) -> CryptoResult<Vec<u8>> {
        let mut output = vec![0_u8; HASH_LEN];
        Argon2::default()
            .hash_password_into(password.as_bytes(), salt, &mut output)
            .map_err(|e| anyhow::anyhow!(e))?;
        Ok(output)
    }

    async fn verify_password(
        &self,
        password: &str,
        hash: &[u8],
        salt: &[u8],
    ) -> CryptoResult<bool> {
        let candidate = self.hash_password(password, salt).await?;
        Ok(candidate.len() == hash.len()
            && candidate
                .iter()
                .zip(hash.iter())
                .fold(0_u8, |acc, (a, b)| acc | (a ^ b))
                == 0)
    }
}
