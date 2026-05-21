use std::{any::Any, collections::VecDeque, path::Path, path::PathBuf, sync::Arc, time::Duration};

use async_trait::async_trait;
use russh::{
    client,
    keys::{
        check_known_hosts_path, decode_secret_key, known_hosts::learn_known_hosts_path,
        load_secret_key, PrivateKeyWithHashAlg,
    },
    Channel, ChannelMsg, Disconnect,
};
use tokio::net::TcpListener;
use uuid::Uuid;

use crate::domain::{
    models::{
        connections::{AuthMethod, SshConfig},
        session::SessionMetadata,
    },
    services::{
        session_service::SshSession,
        ssh_service::{PortForwardTask, SshService},
        SshResult,
    },
};

#[derive(Clone)]
pub struct RusshSshService {
    known_hosts_path: PathBuf,
}

struct KnownHostsVerifier {
    host: String,
    port: u16,
    path: PathBuf,
}

impl client::Handler for KnownHostsVerifier {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if check_known_hosts_path(&self.host, self.port, server_public_key, &self.path)? {
            return Ok(true);
        }

        learn_known_hosts_path(&self.host, self.port, server_public_key, &self.path)?;
        Ok(true)
    }
}

pub struct RusshSession {
    id: String,
    metadata: SessionMetadata,
    handle: client::Handle<KnownHostsVerifier>,
    channel: Channel<client::Msg>,
    read_buffer: VecDeque<u8>,
    active: bool,
}

impl RusshSshService {
    pub fn new(known_hosts_path: impl Into<PathBuf>) -> Self {
        Self {
            known_hosts_path: known_hosts_path.into(),
        }
    }

    async fn connect_handle(
        &self,
        config: &SshConfig,
    ) -> SshResult<client::Handle<KnownHostsVerifier>> {
        let client_config = client::Config {
            // Interactive shells can sit idle for a long time, especially when the
            // user keeps several SSH tabs open. Treat `timeout_secs` as connect/auth
            // intent only; using it as russh inactivity timeout closes idle tabs.
            inactivity_timeout: None,
            keepalive_interval: config.keepalive_interval.map(Duration::from_secs),
            nodelay: true,
            ..Default::default()
        };

        let mut handle = client::connect(
            Arc::new(client_config),
            (config.host.as_str(), config.port),
            KnownHostsVerifier {
                host: config.host.clone(),
                port: config.port,
                path: self.known_hosts_path.clone(),
            },
        )
        .await?;

        match config.credential.auth_method {
            AuthMethod::Password => {
                let password =
                    config.credential.password.as_deref().ok_or_else(|| {
                        anyhow::anyhow!("password authentication requires password")
                    })?;
                let auth = handle
                    .authenticate_password(config.credential.username.clone(), password)
                    .await?;
                if !auth.success() {
                    return Err(anyhow::anyhow!("SSH password authentication failed").into());
                }
            }
            AuthMethod::PubKey => {
                let key = if let Some(private_key) = config
                    .credential
                    .private_key
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                {
                    decode_secret_key(private_key, config.credential.passphrase.as_deref())?
                } else {
                    let private_key_path = config
                        .credential
                        .private_key_path
                        .as_deref()
                        .filter(|value| !value.trim().is_empty())
                        .ok_or_else(|| {
                            anyhow::anyhow!(
                                "public key authentication requires private key or key path"
                            )
                        })?;
                    load_secret_key(
                        Path::new(private_key_path),
                        config.credential.passphrase.as_deref(),
                    )?
                };
                let hash_alg = handle.best_supported_rsa_hash().await?.flatten();
                let auth = handle
                    .authenticate_publickey(
                        config.credential.username.clone(),
                        PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg),
                    )
                    .await?;
                if !auth.success() {
                    return Err(anyhow::anyhow!("SSH public key authentication failed").into());
                }
            }
        }

        Ok(handle)
    }

    fn metadata(id: String, config: &SshConfig) -> SessionMetadata {
        let now = chrono::Utc::now();
        SessionMetadata {
            id,
            host: config.host.clone(),
            port: config.port,
            username: config.credential.username.clone(),
            connected_at: now,
            last_activity: now,
        }
    }

    fn parse_addr(addr: &str) -> SshResult<(String, u32)> {
        let (host, port) = addr
            .rsplit_once(':')
            .ok_or_else(|| anyhow::anyhow!("address must use host:port format"))?;
        Ok((host.to_string(), port.parse()?))
    }
}

#[async_trait]
impl SshService for RusshSshService {
    async fn connect(&self, config: SshConfig) -> SshResult<Box<dyn SshSession>> {
        let handle = self.connect_handle(&config).await?;
        let channel = handle.channel_open_session().await?;
        channel
            .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
            .await?;
        channel.request_shell(true).await?;

        let id = Uuid::new_v4().to_string();
        Ok(Box::new(RusshSession {
            metadata: Self::metadata(id.clone(), &config),
            id,
            handle,
            channel,
            read_buffer: VecDeque::new(),
            active: true,
        }))
    }

    async fn exec_command(&self, config: SshConfig, command: &str) -> SshResult<String> {
        let handle = self.connect_handle(&config).await?;
        let mut channel = handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        let mut output = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    output.extend_from_slice(&data);
                }
                ChannelMsg::ExitStatus { .. } | ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }

        handle
            .disconnect(Disconnect::ByApplication, "", "English")
            .await?;
        String::from_utf8(output).map_err(Into::into)
    }

    async fn exec_session(
        &self,
        config: SshConfig,
        command: &str,
    ) -> SshResult<Box<dyn SshSession>> {
        let handle = self.connect_handle(&config).await?;
        let channel = handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        let id = Uuid::new_v4().to_string();
        Ok(Box::new(RusshSession {
            metadata: Self::metadata(id.clone(), &config),
            id,
            handle,
            channel,
            read_buffer: VecDeque::new(),
            active: true,
        }))
    }

    async fn test_connection(&self, config: SshConfig) -> SshResult<bool> {
        let handle = self.connect_handle(&config).await?;
        handle
            .disconnect(Disconnect::ByApplication, "", "English")
            .await?;
        Ok(true)
    }

    async fn local_port_forward(
        &self,
        config: SshConfig,
        local_addr: &str,
        remote_addr: &str,
    ) -> SshResult<PortForwardTask> {
        let handle = self.connect_handle(&config).await?;
        let listener = TcpListener::bind(local_addr).await?;
        let (remote_host, remote_port) = Self::parse_addr(remote_addr)?;
        let (shutdown, mut shutdown_rx) = tokio::sync::watch::channel(false);

        let task = tokio::spawn(async move {
            loop {
                let accepted = tokio::select! {
                    _ = shutdown_rx.changed() => break,
                    accepted = listener.accept() => accepted,
                };

                let Ok((mut local_stream, local_peer)) = accepted else {
                    continue;
                };
                let Ok(channel) = handle
                    .channel_open_direct_tcpip(
                        remote_host.clone(),
                        remote_port,
                        local_peer.ip().to_string(),
                        u32::from(local_peer.port()),
                    )
                    .await
                else {
                    continue;
                };

                let mut child_shutdown = shutdown_rx.clone();
                tokio::spawn(async move {
                    let mut remote_stream = channel.into_stream();
                    tokio::select! {
                        _ = child_shutdown.changed() => {}
                        _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream) => {}
                    }
                });
            }
        });

        Ok(PortForwardTask {
            shutdown,
            handle: task,
        })
    }
}

#[async_trait]
impl SshSession for RusshSession {
    fn id(&self) -> &str {
        &self.id
    }

    fn metadata(&self) -> &SessionMetadata {
        &self.metadata
    }

    async fn send_data(
        &mut self,
        data: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.channel.data(data).await?;
        self.metadata.last_activity = chrono::Utc::now();
        Ok(())
    }

    async fn read_data(
        &mut self,
        buf: &mut [u8],
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        while self.read_buffer.is_empty() && self.active {
            let message = tokio::time::timeout(Duration::from_millis(5), self.channel.wait()).await;
            match message {
                Ok(Some(ChannelMsg::Data { data }))
                | Ok(Some(ChannelMsg::ExtendedData { data, .. })) => {
                    self.read_buffer.extend(data);
                }
                Ok(Some(ChannelMsg::ExitStatus { .. }))
                | Ok(Some(ChannelMsg::Eof))
                | Ok(Some(ChannelMsg::Close))
                | Ok(None) => {
                    self.active = false;
                }
                Ok(Some(_)) => {}
                Err(_) => break,
            }
        }

        let read_len = buf.len().min(self.read_buffer.len());
        for slot in &mut buf[..read_len] {
            if let Some(byte) = self.read_buffer.pop_front() {
                *slot = byte;
            }
        }

        if read_len > 0 {
            self.metadata.last_activity = chrono::Utc::now();
        }

        Ok(read_len)
    }

    async fn resize(
        &mut self,
        cols: u32,
        rows: u32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.channel.window_change(cols, rows, 0, 0).await?;
        self.metadata.last_activity = chrono::Utc::now();
        Ok(())
    }

    async fn close(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.active = false;
        let _ = self.channel.close().await;
        self.handle
            .disconnect(Disconnect::ByApplication, "", "English")
            .await?;
        Ok(())
    }

    fn is_active(&self) -> bool {
        self.active && !self.handle.is_closed()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}
