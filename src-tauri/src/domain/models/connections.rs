use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuthMethod {
    Password,
    PubKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub username: String,
    pub auth_method: AuthMethod,
    pub password: Option<String>, // encrypted di storage
    pub private_key: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>, // untuk private key terenkripsi
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub credential: Credential,
    pub jump_host: Option<String>, // untuk proxy SSH
    pub timeout_secs: u64,
    pub keepalive_interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String, // UUID
    pub name: String,
    pub description: Option<String>,
    pub config: SshConfig,
    pub group_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

impl Default for SshConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 22,
            credential: Credential {
                username: "root".to_string(),
                auth_method: AuthMethod::Password,
                password: None,
                private_key: None,
                private_key_path: None,
                passphrase: None,
            },
            jump_host: None,
            timeout_secs: 10,
            keepalive_interval: Some(30),
        }
    }
}

impl Connection {
    #[allow(dead_code)]
    pub fn new(name: String, config: SshConfig) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description: None,
            config,
            group_id: None,
            created_at: Utc::now(),
            last_used_at: None,
            tags: vec![],
        }
    }

    #[allow(dead_code)]
    pub fn touch(&mut self) {
        self.last_used_at = Some(Utc::now())
    }
}
