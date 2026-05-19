use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use async_trait::async_trait;
use rusqlite::{params, Connection as SqliteConnection, OptionalExtension};

use crate::{
    domain::{
        models::connections::{Connection as SshConnection, Group, SshConfig},
        repository::{connection_repository::ConnectionRepository, RepoResult},
        services::crypto_service::CryptoService,
    },
    infrastructure::db::{DbError, DbResult},
};

const ENCRYPTED_CONFIG_PREFIX: &str = "enc:v1:";
type ConnectionRow = (
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    String,
    Option<String>,
    String,
);

pub struct ConnectionRepositoryImpl {
    conn: Arc<Mutex<SqliteConnection>>,
    crypto_service: Arc<dyn CryptoService>,
}

impl ConnectionRepositoryImpl {
    pub async fn new(
        db_path: impl Into<PathBuf>,
        crypto_service: Arc<dyn CryptoService>,
    ) -> DbResult<Self> {
        let path = db_path.into();
        if !path.exists() {
            let legacy_path = path.with_file_name("hiraishin.db");
            if legacy_path.exists() {
                std::fs::rename(&legacy_path, &path)?;
            }
        }

        let conn = SqliteConnection::open(&path)?;
        let repo = Self {
            conn: Arc::new(Mutex::new(conn)),
            crypto_service,
        };
        repo.run_migrations().await?;
        repo.encrypt_existing_configs().await?;
        Ok(repo)
    }

    /// Inisialisasi tabel (migrations)
    async fn run_migrations(&self) -> DbResult<()> {
        let conn = self.conn.lock().expect("Connection Error");
        conn.execute_batch(
            r#"
                CREATE TABLE IF NOT EXISTS connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    config TEXT NOT NULL,   -- JSON dari SshConfig
                    group_id TEXT,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    tags TEXT               -- JSON array string
                );

                CREATE TABLE IF NOT EXISTS groups (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    parent_id TEXT,
                    color TEXT,
                    icon TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_id);
                CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
                CREATE INDEX IF NOT EXISTS idx_connections_last_used ON connections(last_used_at);
                "#,
        )?;
        Ok(())
    }

    /// Helper untuk mengkonversi Connection ke row values
    async fn encrypted_config_json(&self, config: &SshConfig) -> DbResult<String> {
        let config_json = serde_json::to_string(config)?;
        let encrypted = self
            .crypto_service
            .encrypt(&config_json)
            .await
            .map_err(|e| DbError::Crypto(e.to_string()))?;
        Ok(format!("{ENCRYPTED_CONFIG_PREFIX}{encrypted}"))
    }

    async fn parse_config(&self, config_value: &str) -> DbResult<SshConfig> {
        if let Some(cipher_text) = config_value.strip_prefix(ENCRYPTED_CONFIG_PREFIX) {
            let plain = self
                .crypto_service
                .decrypt(cipher_text)
                .await
                .map_err(|e| DbError::Crypto(e.to_string()))?;
            return Ok(serde_json::from_str(&plain)?);
        }

        match serde_json::from_str(config_value) {
            Ok(config) => Ok(config),
            Err(_) => {
                let plain = self
                    .crypto_service
                    .decrypt(config_value)
                    .await
                    .map_err(|e| DbError::Crypto(e.to_string()))?;
                Ok(serde_json::from_str(&plain)?)
            }
        }
    }

    async fn encrypt_existing_configs(&self) -> DbResult<()> {
        let rows = {
            let conn = self.conn.lock().expect("Connection Error");
            let mut stmt = conn.prepare("SELECT id, config FROM connections")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.collect::<Result<Vec<(String, String)>, rusqlite::Error>>()?
        };

        for (id, config_value) in rows {
            if config_value.starts_with(ENCRYPTED_CONFIG_PREFIX) {
                continue;
            }

            let Ok(config) = serde_json::from_str::<SshConfig>(&config_value) else {
                continue;
            };
            let encrypted_config = self.encrypted_config_json(&config).await?;
            let conn = self.conn.lock().expect("Connection Error");
            conn.execute(
                "UPDATE connections SET config = ?1 WHERE id = ?2",
                params![encrypted_config, id],
            )?;
        }

        Ok(())
    }

    async fn connection_to_row(
        &self,
        conn: &SshConnection,
    ) -> DbResult<(
        String,
        String,
        Option<String>,
        String,
        Option<String>,
        String,
        Option<String>,
        String,
    )> {
        let config_json = self.encrypted_config_json(&conn.config).await?;
        let tags_json = serde_json::to_string(&conn.tags)?;
        Ok((
            conn.id.clone(),
            conn.name.clone(),
            conn.description.clone(),
            config_json,
            conn.group_id.clone(),
            conn.created_at.to_rfc3339(),
            conn.last_used_at.map(|d| d.to_rfc3339()),
            tags_json,
        ))
    }

    /// Helper untuk membuat Connection dari row
    async fn row_to_connection(
        &self,
        id: String,
        name: String,
        description: Option<String>,
        config_json: String,
        group_id: Option<String>,
        created_at_str: String,
        last_used_at_str: Option<String>,
        tags_json: String,
    ) -> DbResult<SshConnection> {
        let config = self.parse_config(&config_json).await?;
        let tags: Vec<String> = serde_json::from_str(&tags_json)?;
        let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
            .map_err(|e| {
                DbError::Sqlite(rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                ))
            })?
            .with_timezone(&chrono::Utc);
        let last_used_at = match last_used_at_str {
            Some(s) => Some(
                chrono::DateTime::parse_from_rfc3339(&s)
                    .map_err(|e| {
                        DbError::Sqlite(rusqlite::Error::FromSqlConversionFailure(
                            0,
                            rusqlite::types::Type::Text,
                            Box::new(e),
                        ))
                    })?
                    .with_timezone(&chrono::Utc),
            ),
            None => None,
        };
        Ok(SshConnection {
            id,
            name,
            description,
            config,
            group_id,
            created_at,
            last_used_at,
            tags,
        })
    }
}

#[async_trait]
impl ConnectionRepository for ConnectionRepositoryImpl {
    async fn save_connection(&self, conn: &SshConnection) -> RepoResult<()> {
        let (id, name, desc, config_json, group_id, created_at, last_used_at, tags_json) = self
            .connection_to_row(conn)
            .await
            .map_err(|e| anyhow::anyhow!(e))?;

        let conn_lock = self.conn.lock().expect("Error Connection");
        conn_lock.execute(
            r#"
                    INSERT OR REPLACE INTO connections
                    (id, name, description, config, group_id, created_at, last_used_at, tags)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                    "#,
            params![
                id,
                name,
                desc,
                config_json,
                group_id,
                created_at,
                last_used_at,
                tags_json
            ],
        )?;
        Ok(())
    }

    async fn get_connection(&self, id: &str) -> RepoResult<Option<SshConnection>> {
        let row = {
            let conn_lock = self.conn.lock().expect("Error Connection");
            let mut stmt = conn_lock.prepare(
                "SELECT id, name, description, config, group_id, created_at, last_used_at, tags
                 FROM connections WHERE id = ?1",
            )?;
            stmt.query_row(params![id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .optional()?
        };

        match row {
            Some((id, name, desc, config_json, group_id, created_at, last_used_at, tags_json)) => {
                let conn = self
                    .row_to_connection(
                        id,
                        name,
                        desc,
                        config_json,
                        group_id,
                        created_at,
                        last_used_at,
                        tags_json,
                    )
                    .await
                    .map_err(|e| anyhow::anyhow!(e))?;
                Ok(Some(conn))
            }
            None => Ok(None),
        }
    }

    async fn get_all_connections(&self) -> RepoResult<Vec<SshConnection>> {
        let raw_rows = {
            let conn_lock = self.conn.lock().expect("Error Connection");
            let mut stmt = conn_lock.prepare(
                "SELECT id, name, description, config, group_id, created_at, last_used_at, tags FROM connections ORDER BY name"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })?;
            rows.collect::<Result<Vec<ConnectionRow>, rusqlite::Error>>()?
        };

        let mut connections = Vec::new();
        for row in raw_rows {
            let (id, name, desc, config_json, group_id, created_at, last_used_at, tags_json) = row;
            let conn = self
                .row_to_connection(
                    id,
                    name,
                    desc,
                    config_json,
                    group_id,
                    created_at,
                    last_used_at,
                    tags_json,
                )
                .await
                .map_err(|e| anyhow::anyhow!(e))?;
            connections.push(conn);
        }
        Ok(connections)
    }

    async fn update_connection(&self, conn: &SshConnection) -> RepoResult<()> {
        // Sama seperti save_connection dengan INSERT OR REPLACE
        self.save_connection(conn).await
    }

    async fn delete_connection(&self, id: &str) -> RepoResult<()> {
        let conn_lock = self.conn.lock().expect("Error Connection");
        let affected = conn_lock.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(Box::new(DbError::NotFound(id.to_string())));
        }
        Ok(())
    }

    async fn get_connections_by_group(&self, group_id: &str) -> RepoResult<Vec<SshConnection>> {
        let raw_rows = {
            let conn_lock = self.conn.lock().expect("Error Connection");
            let mut stmt = conn_lock.prepare(
                "SELECT id, name, description, config, group_id, created_at, last_used_at, tags
                 FROM connections WHERE group_id = ?1 ORDER BY name",
            )?;
            let rows = stmt.query_map(params![group_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })?;
            rows.collect::<Result<Vec<ConnectionRow>, rusqlite::Error>>()?
        };

        let mut connections = Vec::new();
        for row in raw_rows {
            let (id, name, desc, config_json, gid, created_at, last_used_at, tags_json) = row;
            let conn = self
                .row_to_connection(
                    id,
                    name,
                    desc,
                    config_json,
                    gid,
                    created_at,
                    last_used_at,
                    tags_json,
                )
                .await
                .map_err(|e| anyhow::anyhow!(e))?;
            connections.push(conn);
        }
        Ok(connections)
    }

    async fn search_connections(&self, query: &str) -> RepoResult<Vec<SshConnection>> {
        let pattern = format!("%{}%", query);
        let raw_rows = {
            let conn_lock = self.conn.lock().expect("Error Connection");
            let mut stmt = conn_lock.prepare(
                "SELECT id, name, description, config, group_id, created_at, last_used_at, tags
                 FROM connections WHERE name LIKE ?1 OR description LIKE ?1
                 ORDER BY name",
            )?;
            let rows = stmt.query_map(params![pattern], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })?;
            rows.collect::<Result<Vec<ConnectionRow>, rusqlite::Error>>()?
        };

        let mut connections = Vec::new();
        for row in raw_rows {
            let (id, name, desc, config_json, gid, created_at, last_used_at, tags_json) = row;
            let conn = self
                .row_to_connection(
                    id,
                    name,
                    desc,
                    config_json,
                    gid,
                    created_at,
                    last_used_at,
                    tags_json,
                )
                .await
                .map_err(|e| anyhow::anyhow!(e))?;
            connections.push(conn);
        }
        Ok(connections)
    }

    // Group operations
    async fn save_group(&self, group: &Group) -> RepoResult<()> {
        let conn_lock = self.conn.lock().expect("Error Connection");
        conn_lock.execute(
            "INSERT OR REPLACE INTO groups (id, name, parent_id, color, icon) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![group.id, group.name, group.parent_id, group.color, group.icon],
        )?;
        Ok(())
    }

    async fn get_group(&self, id: &str) -> RepoResult<Option<Group>> {
        let conn_lock = self.conn.lock().expect("Error Connection");
        let mut stmt = conn_lock
            .prepare("SELECT id, name, parent_id, color, icon FROM groups WHERE id = ?1")?;
        let row = stmt
            .query_row(params![id], |row| {
                Ok(Group {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    color: row.get(3)?,
                    icon: row.get(4)?,
                })
            })
            .optional()?;
        Ok(row)
    }

    async fn get_all_groups(&self) -> RepoResult<Vec<Group>> {
        let conn_lock = self.conn.lock().expect("Error Connection");
        let mut stmt = conn_lock
            .prepare("SELECT id, name, parent_id, color, icon FROM groups ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
            })
        })?;
        let mut groups = Vec::new();
        for row in rows {
            groups.push(row?);
        }
        Ok(groups)
    }

    async fn update_group(&self, group: &Group) -> RepoResult<()> {
        self.save_group(group).await
    }

    async fn delete_group(&self, id: &str) -> RepoResult<()> {
        let conn_lock = self.conn.lock().expect("Error Connection");
        // Optionally, set group_id to NULL for connections that belong to this group
        conn_lock.execute(
            "UPDATE connections SET group_id = NULL WHERE group_id = ?1",
            params![id],
        )?;
        let affected = conn_lock.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(Box::new(DbError::NotFound(id.to_string())));
        }
        Ok(())
    }
}
