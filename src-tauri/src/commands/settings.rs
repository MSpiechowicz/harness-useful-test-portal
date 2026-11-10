//! Settings commands: load and save the quiz settings in the app config directory.
//!
//! The page owns the policy (what the settings mean); this only stores them. The whole file is
//! replaced on every save, under a lock so two saves cannot interleave.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use tauri::State;

use super::blocking;
use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::settings::{self, Settings, SettingsError};

/// Where the settings live, and the lock around reading and writing them. Managed as app state.
#[derive(Clone)]
pub struct SettingsStore(Arc<StoreInner>);

struct StoreInner {
    path: PathBuf,
    lock: Mutex<()>,
}

impl SettingsStore {
    /// A store for the settings file at `path`.
    pub fn new(path: PathBuf) -> Self {
        Self(Arc::new(StoreInner {
            path,
            lock: Mutex::new(()),
        }))
    }

    fn load(&self) -> CommandResult<Settings> {
        let _guard = self.0.lock.lock().unwrap_or_else(PoisonError::into_inner);

        settings::load(&self.0.path).map_err(|error| settings_error("cannot read the settings", error))
    }

    fn save(&self, settings: Settings) -> CommandResult<Settings> {
        let _guard = self.0.lock.lock().unwrap_or_else(PoisonError::into_inner);

        settings::save(&self.0.path, settings).map_err(|error| settings_error("cannot save the settings", error))
    }
}

/// The stored settings, or the defaults when there are none. A stored file that is not valid
/// settings is kept as `settings.json.bak` and the defaults are returned.
#[tauri::command]
pub async fn settings_load(store: State<'_, SettingsStore>) -> CommandResult<Settings> {
    let store = store.inner().clone();

    blocking(move || store.load()).await
}

/// Validates and normalizes `settings`, stores them and returns what was stored. `invalidInput`
/// names the first field that breaks a rule.
///
/// Taken as JSON so that a wrong type is reported as `invalidInput` too, not as a decoder error.
#[tauri::command]
pub async fn settings_save(store: State<'_, SettingsStore>, settings: serde_json::Value) -> CommandResult<Settings> {
    let settings: Settings = serde_json::from_value(settings)
        .map_err(|error| CommandError::new(ErrorCode::InvalidInput, format!("invalid settings: {error}")))?;
    let store = store.inner().clone();

    blocking(move || store.save(settings)).await
}

fn settings_error(context: &str, error: SettingsError) -> CommandError {
    match error {
        SettingsError::Invalid(invalid) => {
            CommandError::new(ErrorCode::InvalidInput, format!("invalid settings, {invalid}"))
        }
        SettingsError::Io(error) => {
            tracing::warn!(%error, "{context}");
            CommandError::new(ErrorCode::Io, format!("{context}: {error}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::settings::SETTINGS_FILE;
    use crate::test_support::TempDir;

    fn store(directory: &TempDir) -> SettingsStore {
        SettingsStore::new(directory.path().join("config").join(SETTINGS_FILE))
    }

    #[test]
    fn a_fresh_install_loads_the_defaults() {
        let directory = TempDir::new("store-fresh");

        assert_eq!(store(&directory).load().expect("loads"), Settings::default());
    }

    #[test]
    fn saved_settings_are_returned_normalized_and_load_back() {
        let directory = TempDir::new("store-save");
        let store = store(&directory);
        let settings = Settings {
            topics: vec!["b".to_owned(), "a".to_owned(), "b".to_owned()],
            question_count: 40,
            ..Settings::default()
        };

        let saved = store.save(settings).expect("saves");

        assert_eq!(saved.topics, ["a", "b"]);
        assert_eq!(store.load().expect("loads"), saved);
    }

    #[test]
    fn invalid_settings_are_invalid_input_that_names_the_field() {
        let directory = TempDir::new("store-invalid");

        let error = store(&directory)
            .save(Settings {
                question_count: 1000,
                ..Settings::default()
            })
            .expect_err("rejected");

        assert_eq!(error.code(), ErrorCode::InvalidInput);
        assert!(error.message().contains("questionCount"), "{}", error.message());
    }

    #[test]
    fn an_unreadable_settings_path_is_an_io_error() {
        let directory = TempDir::new("store-io");
        let store = store(&directory);
        fs::create_dir_all(&store.0.path).expect("a directory where the file should be");

        let error = store.load().expect_err("unreadable");

        assert_eq!(error.code(), ErrorCode::Io);
    }
}
