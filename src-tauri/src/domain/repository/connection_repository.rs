use async_trait::async_trait;

use crate::domain::{
    models::connections::{Connection, Group, SavedPortForward},
    repository::RepoResult,
};

#[async_trait]
pub trait ConnectionRepository: Send + Sync {
    // Connection CRUD
    async fn save_connection(&self, conn: &Connection) -> RepoResult<()>;
    async fn get_connection(&self, id: &str) -> RepoResult<Option<Connection>>;
    async fn get_all_connections(&self) -> RepoResult<Vec<Connection>>;
    async fn update_connection(&self, conn: &Connection) -> RepoResult<()>;
    async fn delete_connection(&self, id: &str) -> RepoResult<()>;

    async fn get_connections_by_group(&self, group_id: &str) -> RepoResult<Vec<Connection>>;
    async fn search_connections(&self, query: &str) -> RepoResult<Vec<Connection>>;

    // Group CRUD
    async fn save_group(&self, group: &Group) -> RepoResult<()>;
    async fn get_group(&self, id: &str) -> RepoResult<Option<Group>>;
    async fn get_all_groups(&self) -> RepoResult<Vec<Group>>;
    async fn update_group(&self, group: &Group) -> RepoResult<()>;
    async fn delete_group(&self, id: &str) -> RepoResult<()>;

    // Port forward CRUD
    async fn save_port_forward(&self, forward: &SavedPortForward) -> RepoResult<()>;
    async fn get_port_forward(&self, id: &str) -> RepoResult<Option<SavedPortForward>>;
    async fn get_all_port_forwards(&self) -> RepoResult<Vec<SavedPortForward>>;
    async fn delete_port_forward(&self, id: &str) -> RepoResult<()>;
}
