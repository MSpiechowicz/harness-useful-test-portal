//! Opaque JSON documents the page keeps in the app config directory (the quiz history and the
//! paused session).
//!
//! The page owns the shape and the rules of a document; this only stores it. Everything here is
//! pure (no Tauri): the name whitelist and the file round trip, so the commands only add the
//! config directory and a lock.
//!
//! Loading a file that is not JSON, or is too large, renames it to `<name>.bak` and reports it as
//! invalid so the page can start fresh without the user's data being lost. Saving writes a
//! temporary file next to the document and renames it over it.

use std::io;
use std::path::Path;

use serde_json::Value;

use crate::files::{move_aside, read_limited, write_atomically};

/// A document, stored or loaded, is at most this many bytes of compact JSON.
pub const MAX_DATA_BYTES: u64 = 2 * 1024 * 1024;

/// The documents the page may store. The file name never comes from the page: only these names do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DataName {
    History,
    Session,
}

impl DataName {
    /// The document called `name` (exact, case-sensitive), if there is one.
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "history" => Some(Self::History),
            "session" => Some(Self::Session),
            _ => None,
        }
    }

    /// File name of the document inside the app config directory.
    pub fn file_name(self) -> &'static str {
        match self {
            Self::History => "history.json",
            Self::Session => "session.json",
        }
    }
}

/// Why a document could not be loaded or saved.
#[derive(Debug)]
pub enum DataError {
    /// The stored file or the value to store cannot be used; the message is safe to show.
    Invalid(String),
    /// The file or its directory cannot be read or written.
    Io(io::Error),
}

impl From<io::Error> for DataError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// The JSON stored at `path`; `null` when there is no file.
///
/// A file that is not JSON or is larger than [`MAX_DATA_BYTES`] is renamed to `<path>.bak`,
/// replacing an older backup, and reported as [`DataError::Invalid`]. A file that cannot be read,
/// or cannot be moved aside, is an [`DataError::Io`] and stays where it is.
pub fn load(path: &Path) -> Result<Value, DataError> {
    let bytes = match read_limited(path, MAX_DATA_BYTES) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(error) => return Err(error.into()),
    };

    let reason = if bytes.len() as u64 > MAX_DATA_BYTES {
        "the file is too large".to_owned()
    } else {
        match serde_json::from_slice(&bytes) {
            Ok(value) => return Ok(value),
            Err(error) => format!("the file is not valid JSON ({error})"),
        }
    };

    move_aside(path)?;

    let name = path.file_name().map(|name| name.to_string_lossy()).unwrap_or_default();
    tracing::warn!(reason, "a stored document is invalid; kept as a backup");

    Err(DataError::Invalid(format!("{reason}; kept as {name}.bak")))
}

/// Writes `value` as compact JSON to `path` (creating its directory) through a temporary file and
/// a rename. A value over [`MAX_DATA_BYTES`] is [`DataError::Invalid`] and nothing is written.
pub fn save(path: &Path, value: &Value) -> Result<(), DataError> {
    let json = serde_json::to_vec(value).map_err(io::Error::other)?;

    if json.len() as u64 > MAX_DATA_BYTES {
        return Err(DataError::Invalid(format!(
            "the data is too large ({} bytes, at most {MAX_DATA_BYTES})",
            json.len()
        )));
    }

    write_atomically(path, &json)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;

    use super::*;
    use crate::files::sibling;
    use crate::test_support::TempDir;

    fn file(directory: &TempDir) -> std::path::PathBuf {
        directory.path().join(DataName::History.file_name())
    }

    fn names_in(directory: &TempDir) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(directory.path())
            .expect("directory")
            .map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();

        names
    }

    #[test]
    fn only_the_two_exact_names_are_documents() {
        assert_eq!(DataName::parse("history"), Some(DataName::History));
        assert_eq!(DataName::parse("session"), Some(DataName::Session));
        assert_eq!(DataName::History.file_name(), "history.json");
        assert_eq!(DataName::Session.file_name(), "session.json");

        for name in [
            "settings",
            "History",
            "SESSION",
            "history.json",
            "../history",
            "",
            "session\0",
            " history",
            "history ",
        ] {
            assert_eq!(DataName::parse(name), None, "{name:?}");
        }
    }

    #[test]
    fn a_missing_file_loads_as_null() {
        let directory = TempDir::new("data-missing");

        assert_eq!(load(&file(&directory)).expect("loads"), Value::Null);
    }

    #[test]
    fn a_saved_document_loads_back_unchanged() {
        let directory = TempDir::new("data-round-trip");
        let path = directory.path().join("nested").join("history.json");
        let value = json!({ "version": 1, "entries": [{ "id": "a", "ratio": 0.5, "text": "żółć" }], "none": null });

        save(&path, &value).expect("saves");

        assert_eq!(load(&path).expect("loads"), value);
        assert_eq!(
            fs::read(&path).expect("file"),
            serde_json::to_vec(&value).expect("compact JSON")
        );
    }

    #[test]
    fn saving_replaces_the_previous_document_and_leaves_no_temporary_file() {
        let directory = TempDir::new("data-replace");
        let path = file(&directory);

        save(&path, &json!({ "n": 1 })).expect("first save");
        save(&path, &json!({ "n": 2 })).expect("second save");

        assert_eq!(load(&path).expect("loads"), json!({ "n": 2 }));
        assert_eq!(names_in(&directory), ["history.json"]);
    }

    #[test]
    fn a_saved_null_loads_as_null() {
        let directory = TempDir::new("data-null");
        let path = file(&directory);

        save(&path, &json!({ "n": 1 })).expect("saves");
        save(&path, &Value::Null).expect("saves null");

        assert_eq!(load(&path).expect("loads"), Value::Null);
        assert!(!sibling(&path, ".bak").exists(), "null is a valid document");
    }

    #[test]
    fn a_value_over_the_limit_is_rejected_and_nothing_is_written() {
        let directory = TempDir::new("data-oversize-save");
        let path = file(&directory);
        let value = Value::String("x".repeat(MAX_DATA_BYTES as usize));

        let error = save(&path, &value).expect_err("rejected");

        assert!(matches!(error, DataError::Invalid(_)), "{error:?}");
        assert!(names_in(&directory).is_empty(), "no file and no .tmp");
    }

    #[test]
    fn an_oversized_save_keeps_the_previous_document() {
        let directory = TempDir::new("data-oversize-keeps");
        let path = file(&directory);
        save(&path, &json!({ "n": 1 })).expect("saves");

        save(&path, &Value::String("x".repeat(MAX_DATA_BYTES as usize))).expect_err("rejected");

        assert_eq!(load(&path).expect("loads"), json!({ "n": 1 }));
        assert_eq!(names_in(&directory), ["history.json"]);
    }

    #[test]
    fn a_document_of_exactly_the_limit_is_stored() {
        let directory = TempDir::new("data-limit");
        let path = file(&directory);
        // Two quotes around the text make up the rest of the limit.
        let value = Value::String("x".repeat(MAX_DATA_BYTES as usize - 2));

        save(&path, &value).expect("saves");

        assert_eq!(load(&path).expect("loads"), value);
    }

    #[test]
    fn a_file_that_is_not_json_or_too_large_is_kept_as_a_backup_and_reported_invalid() {
        let broken = [
            ("not json", "this is not json".to_owned()),
            ("cut off", r#"{ "entries": [1, 2"#.to_owned()),
            ("empty", String::new()),
            ("too large", " ".repeat(MAX_DATA_BYTES as usize + 1)),
        ];

        for (label, contents) in broken {
            let directory = TempDir::new("data-corrupt");
            let path = file(&directory);
            fs::write(&path, &contents).expect("write");

            let error = load(&path).expect_err(label);

            let DataError::Invalid(message) = error else {
                panic!("{label}: expected Invalid, got {error:?}");
            };
            assert!(message.ends_with("kept as history.json.bak"), "{label}: {message}");
            assert!(
                !message.contains(directory.path().to_str().expect("UTF-8")),
                "{label}: {message}"
            );
            assert!(!path.exists(), "{label}: the broken file is moved away");
            assert_eq!(
                fs::read_to_string(sibling(&path, ".bak")).expect(label),
                contents,
                "{label}"
            );
            assert_eq!(
                load(&path).expect(label),
                Value::Null,
                "{label}: then there is no document"
            );
        }
    }

    #[test]
    fn a_new_backup_replaces_an_older_one() {
        let directory = TempDir::new("data-backup-replaced");
        let path = file(&directory);
        fs::write(sibling(&path, ".bak"), "old backup").expect("write");
        fs::write(&path, "{ broken").expect("write");

        load(&path).expect_err("invalid");

        assert_eq!(fs::read_to_string(sibling(&path, ".bak")).expect("backup"), "{ broken");
    }

    #[test]
    fn a_path_that_cannot_be_read_is_an_io_error_and_nothing_is_moved() {
        let directory = TempDir::new("data-unreadable");
        let path = file(&directory);
        fs::create_dir(&path).expect("a directory where the file should be");

        assert!(matches!(load(&path), Err(DataError::Io(_))));
        assert!(path.is_dir(), "nothing is moved aside");
        assert!(!sibling(&path, ".bak").exists());
    }

    #[test]
    fn a_broken_file_that_cannot_be_moved_aside_is_an_io_error_and_stays() {
        let directory = TempDir::new("data-aside-fails");
        let path = file(&directory);
        fs::write(&path, "not json").expect("write");
        // A non-empty directory cannot be replaced by the rename.
        let backup = sibling(&path, ".bak");
        fs::create_dir(&backup).expect("backup directory");
        fs::write(backup.join("keep"), "x").expect("write");

        assert!(matches!(load(&path), Err(DataError::Io(_))));
        assert_eq!(fs::read_to_string(&path).expect("file"), "not json");
    }
}
