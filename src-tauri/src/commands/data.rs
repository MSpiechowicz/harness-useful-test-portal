//! Data commands: load and save the page's JSON documents (history, paused session) in the app
//! config directory.
//!
//! The page owns the shape of a document; this only stores it. The document is chosen by name from
//! a fixed list, never by path. Reads and writes run under one lock so a save cannot interleave
//! with a load or another save.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use serde_json::Value;
use tauri::State;

use super::blocking;
use crate::data::{self, DataError, DataName};
use crate::error::{CommandError, CommandResult, ErrorCode};

/// Where the documents live, and the lock around reading and writing them. Managed as app state.
#[derive(Clone)]
pub struct DataStore(Arc<StoreInner>);

struct StoreInner {
    directory: PathBuf,
    lock: Mutex<()>,
}

impl DataStore {
    /// A store for the documents in `directory`.
    pub fn new(directory: PathBuf) -> Self {
        Self(Arc::new(StoreInner {
            directory,
            lock: Mutex::new(()),
        }))
    }

    fn load(&self, name: DataName) -> CommandResult<Value> {
        let _guard = self.0.lock.lock().unwrap_or_else(PoisonError::into_inner);

        data::load(&self.path(name)).map_err(|error| data_error("cannot read the stored data", error))
    }

    fn save(&self, name: DataName, value: &Value) -> CommandResult<()> {
        let _guard = self.0.lock.lock().unwrap_or_else(PoisonError::into_inner);

        data::save(&self.path(name), value).map_err(|error| data_error("cannot save the data", error))
    }

    fn path(&self, name: DataName) -> PathBuf {
        self.0.directory.join(name.file_name())
    }
}

/// The stored document `name` (`history` or `session`), or `null` when there is none. A stored
/// file that is not JSON or is too large is kept as `<file>.bak` and reported as `invalidInput`.
#[tauri::command]
pub async fn data_load(store: State<'_, DataStore>, name: String) -> CommandResult<Value> {
    let name = parse_name(&name)?;
    let store = store.inner().clone();

    blocking(move || store.load(name)).await
}

/// Stores `value` as the document `name` (`history` or `session`), replacing the previous one.
/// A value over the size limit is `invalidInput` and nothing is written. Saving `null` clears it.
#[tauri::command]
pub async fn data_save(store: State<'_, DataStore>, name: String, value: Value) -> CommandResult<()> {
    let name = parse_name(&name)?;
    let store = store.inner().clone();

    blocking(move || store.save(name, &value)).await
}

/// Taken as text so that an unknown name is reported as `invalidInput` too, not as a decoder error.
fn parse_name(name: &str) -> CommandResult<DataName> {
    DataName::parse(name).ok_or_else(|| CommandError::new(ErrorCode::InvalidInput, "unknown data name"))
}

fn data_error(context: &str, error: DataError) -> CommandError {
    match error {
        DataError::Invalid(message) => CommandError::new(ErrorCode::InvalidInput, message),
        DataError::Io(error) => {
            tracing::warn!(%error, "{context}");
            CommandError::new(ErrorCode::Io, format!("{context}: {error}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::*;
    use crate::data::MAX_DATA_BYTES;
    use crate::settings::SETTINGS_FILE;
    use crate::test_support::TempDir;

    fn store(directory: &TempDir) -> DataStore {
        DataStore::new(directory.path().join("config"))
    }

    #[test]
    fn an_unknown_name_is_invalid_input() {
        for name in ["settings", "History", "history.json", "../history", "", "session\0"] {
            let error = parse_name(name).expect_err(name);

            assert_eq!(error.code(), ErrorCode::InvalidInput, "{name:?}");
        }

        assert_eq!(parse_name("history").expect("known"), DataName::History);
        assert_eq!(parse_name("session").expect("known"), DataName::Session);
    }

    #[test]
    fn a_fresh_install_loads_null_for_both_documents() {
        let directory = TempDir::new("data-store-fresh");
        let store = store(&directory);

        assert_eq!(store.load(DataName::History).expect("loads"), Value::Null);
        assert_eq!(store.load(DataName::Session).expect("loads"), Value::Null);
    }

    #[test]
    fn the_two_documents_are_stored_separately_and_settings_are_untouched() {
        let directory = TempDir::new("data-store-two");
        let store = store(&directory);
        let settings = directory.path().join("config").join(SETTINGS_FILE);
        fs::create_dir_all(settings.parent().expect("directory")).expect("directory");
        fs::write(&settings, "{ \"questionCount\": 7 }").expect("write");

        store
            .save(DataName::History, &json!({ "of": "history" }))
            .expect("saves");
        store
            .save(DataName::Session, &json!({ "of": "session" }))
            .expect("saves");

        assert_eq!(
            store.load(DataName::History).expect("loads"),
            json!({ "of": "history" })
        );
        assert_eq!(
            store.load(DataName::Session).expect("loads"),
            json!({ "of": "session" })
        );
        assert!(directory.path().join("config").join("history.json").is_file());
        assert!(directory.path().join("config").join("session.json").is_file());
        assert_eq!(
            fs::read_to_string(&settings).expect("settings"),
            "{ \"questionCount\": 7 }"
        );
    }

    #[test]
    fn a_saved_null_clears_the_document() {
        let directory = TempDir::new("data-store-clear");
        let store = store(&directory);

        store.save(DataName::Session, &json!({ "n": 1 })).expect("saves");
        store.save(DataName::Session, &Value::Null).expect("clears");

        assert_eq!(store.load(DataName::Session).expect("loads"), Value::Null);
    }

    #[test]
    fn an_oversized_save_is_invalid_input_and_writes_nothing() {
        let directory = TempDir::new("data-store-oversize");
        let store = store(&directory);

        let error = store
            .save(DataName::History, &Value::String("x".repeat(MAX_DATA_BYTES as usize)))
            .expect_err("rejected");

        assert_eq!(error.code(), ErrorCode::InvalidInput);
        let written = fs::read_dir(directory.path().join("config")).map_or(0, Iterator::count);
        assert_eq!(written, 0, "no file and no .tmp");
    }

    #[test]
    fn a_damaged_file_is_invalid_input_that_names_the_backup_and_then_loads_as_null() {
        let directory = TempDir::new("data-store-damaged");
        let store = store(&directory);
        let path = directory.path().join("config").join("history.json");
        fs::create_dir_all(path.parent().expect("directory")).expect("directory");
        fs::write(&path, "{ broken").expect("write");

        let error = store.load(DataName::History).expect_err("damaged");

        assert_eq!(error.code(), ErrorCode::InvalidInput);
        assert!(
            error.message().ends_with("kept as history.json.bak"),
            "{}",
            error.message()
        );
        assert_eq!(
            fs::read_to_string(path.with_file_name("history.json.bak")).expect("backup"),
            "{ broken"
        );
        assert_eq!(store.load(DataName::History).expect("loads"), Value::Null);
    }

    #[test]
    fn an_unreadable_path_is_an_io_error_and_nothing_is_moved() {
        let directory = TempDir::new("data-store-io");
        let store = store(&directory);
        let path = directory.path().join("config").join("history.json");
        fs::create_dir_all(&path).expect("a directory where the file should be");

        let error = store.load(DataName::History).expect_err("unreadable");

        assert_eq!(error.code(), ErrorCode::Io);
        assert!(path.is_dir(), "nothing is moved aside");
        assert!(!path.with_file_name("history.json.bak").exists());
    }
}
