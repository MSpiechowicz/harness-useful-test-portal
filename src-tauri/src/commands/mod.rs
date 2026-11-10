//! IPC commands the page may call in the app (see `src/lib/shell/shell.ts`). Each must also be
//! listed in `command_names.rs`, registered in `lib.rs` and granted in `capabilities/default.json`.

pub mod links;
pub mod settings;
pub mod updates;

use crate::error::{CommandError, CommandResult};

/// Runs blocking work (file access, installing an update) off the async runtime's worker threads.
async fn blocking<T, F>(task: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> CommandResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| CommandError::internal(format!("background task failed: {error}")))?
}
