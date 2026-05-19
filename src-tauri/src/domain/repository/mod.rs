pub mod connection_repository;

pub type RepoResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
