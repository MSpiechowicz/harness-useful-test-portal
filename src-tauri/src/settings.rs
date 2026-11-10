//! The user's quiz settings and how they are stored.
//!
//! The shape and the rules mirror `src/lib/settings/schema.ts`; `fixtures/settings-default.json`
//! is the shared default both sides test against. Everything here is pure (no Tauri): validation,
//! normalization and the file round trip, so the commands only add the config directory and a lock.
//!
//! Loading never fails because of the file's content: a file that is not valid settings is renamed
//! to `settings.json.bak` and the defaults are used. Saving writes a temporary file next to the
//! settings and renames it over them, so a crash never leaves a half-written file.

use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// File name of the settings inside the app config directory.
pub const SETTINGS_FILE: &str = "settings.json";

/// The only settings version there is.
pub const CURRENT_VERSION: i64 = 1;

/// A settings file larger than this is treated as corrupt (real ones are a few hundred bytes).
const MAX_FILE_BYTES: u64 = 256 * 1024;

const MAX_LANGUAGE_LENGTH: usize = 16;
const QUESTION_COUNT_RANGE: (i64, i64) = (5, 100);
const TIMER_MINUTES_RANGE: (i64, i64) = (0, 180);
const MAX_TOPICS: usize = 200;
const MAX_SLUG_LENGTH: usize = 64;
const TEST_STYLES: &[&str] = &["mixed", "single", "multi", "true-false"];
const DIFFICULTIES: &[&str] = &["basic", "intermediate", "advanced"];
const THEMES: &[&str] = &["system", "light", "dark"];

/// The settings the Settings page edits. Missing fields take their default and unknown fields are
/// ignored, so files written by older or newer versions still load.
///
/// Numbers are `i64` and choices are strings so that an out-of-range value reaches [`validate`](Self::validate)
/// and is reported by field name instead of failing the decoder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: i64,
    pub language: String,
    /// Color theme: `system` follows the operating system, `light` and `dark` are explicit.
    pub theme: String,
    pub question_count: i64,
    /// Minutes for a test; 0 turns the timer off.
    pub timer_minutes: i64,
    pub test_style: String,
    /// Topic slugs to draw questions from; empty means all.
    pub topics: Vec<String>,
    /// Difficulties to draw questions from; empty means all.
    pub difficulties: Vec<String>,
    pub shuffle_questions: bool,
    pub shuffle_options: bool,
    pub check_for_updates: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            language: "en".to_owned(),
            theme: "system".to_owned(),
            question_count: 20,
            timer_minutes: 30,
            test_style: "mixed".to_owned(),
            topics: Vec::new(),
            difficulties: Vec::new(),
            shuffle_questions: true,
            shuffle_options: true,
            check_for_updates: true,
        }
    }
}

/// A settings value that breaks a rule: the camelCase field name and what is wrong with it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invalid {
    pub field: &'static str,
    pub message: String,
}

impl Invalid {
    fn new(field: &'static str, message: impl Into<String>) -> Self {
        Self {
            field,
            message: message.into(),
        }
    }
}

impl fmt::Display for Invalid {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.field, self.message)
    }
}

/// Why settings could not be loaded or saved.
#[derive(Debug)]
pub enum SettingsError {
    /// The settings break a rule (only from saving).
    Invalid(Invalid),
    /// The settings file or its directory cannot be read or written.
    Io(io::Error),
}

impl From<Invalid> for SettingsError {
    fn from(invalid: Invalid) -> Self {
        Self::Invalid(invalid)
    }
}

impl From<io::Error> for SettingsError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl Settings {
    /// Checks every rule; the first broken one is reported. Expects a [normalized](Self::normalize) value.
    pub fn validate(&self) -> Result<(), Invalid> {
        if self.version != CURRENT_VERSION {
            return Err(Invalid::new("version", format!("must be {CURRENT_VERSION}")));
        }

        if !is_language_tag(&self.language) {
            return Err(Invalid::new(
                "language",
                "must be a language code such as \"en\" or \"pt-BR\"",
            ));
        }

        if !THEMES.contains(&self.theme.as_str()) {
            return Err(Invalid::new("theme", format!("must be one of {}", THEMES.join(", "))));
        }

        check_range("questionCount", self.question_count, QUESTION_COUNT_RANGE)?;
        check_range("timerMinutes", self.timer_minutes, TIMER_MINUTES_RANGE)?;

        if !TEST_STYLES.contains(&self.test_style.as_str()) {
            return Err(Invalid::new(
                "testStyle",
                format!("must be one of {}", TEST_STYLES.join(", ")),
            ));
        }

        if self.topics.len() > MAX_TOPICS {
            return Err(Invalid::new("topics", format!("at most {MAX_TOPICS} topics")));
        }

        if let Some(topic) = self.topics.iter().find(|topic| !is_slug(topic)) {
            return Err(Invalid::new("topics", format!("{topic:?} is not a topic id")));
        }

        if let Some(difficulty) = self
            .difficulties
            .iter()
            .find(|difficulty| !DIFFICULTIES.contains(&difficulty.as_str()))
        {
            return Err(Invalid::new(
                "difficulties",
                format!("{difficulty:?} is not one of {}", DIFFICULTIES.join(", ")),
            ));
        }

        Ok(())
    }

    /// The same settings with `topics` and `difficulties` sorted and free of duplicates.
    pub fn normalize(mut self) -> Self {
        self.topics.sort();
        self.topics.dedup();

        self.difficulties.sort_by_key(|difficulty| {
            DIFFICULTIES
                .iter()
                .position(|known| known == difficulty)
                .unwrap_or(DIFFICULTIES.len())
        });
        self.difficulties.dedup();

        self
    }

    /// Normalizes, then validates: the value that may be stored.
    pub fn prepared(self) -> Result<Self, Invalid> {
        let settings = self.normalize();
        settings.validate()?;

        Ok(settings)
    }
}

fn check_range(field: &'static str, value: i64, (min, max): (i64, i64)) -> Result<(), Invalid> {
    if (min..=max).contains(&value) {
        return Ok(());
    }

    Err(Invalid::new(field, format!("must be between {min} and {max}")))
}

/// `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`, at most [`MAX_LANGUAGE_LENGTH`] characters.
fn is_language_tag(value: &str) -> bool {
    if value.len() > MAX_LANGUAGE_LENGTH {
        return false;
    }

    let mut parts = value.split('-');

    let primary_ok = parts.next().is_some_and(|primary| {
        (2..=3).contains(&primary.len()) && primary.bytes().all(|byte| byte.is_ascii_lowercase())
    });

    primary_ok
        && parts
            .all(|subtag| (2..=8).contains(&subtag.len()) && subtag.bytes().all(|byte| byte.is_ascii_alphanumeric()))
}

/// `^[a-z0-9]+(-[a-z0-9]+)*$`, at most [`MAX_SLUG_LENGTH`] characters.
fn is_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_SLUG_LENGTH
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

/// The settings stored at `path`; the defaults when there is no file.
///
/// A file that is not valid settings (not JSON, a rule broken, too large, not UTF-8) is renamed to
/// `<path>.bak`, replacing an older backup, and the defaults are returned. Only a file that exists
/// but cannot be read is an error.
pub fn load(path: &Path) -> Result<Settings, SettingsError> {
    let bytes = match read_limited(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(error) => return Err(error.into()),
    };

    match parse(&bytes) {
        Ok(settings) => Ok(settings),
        Err(reason) => {
            move_aside(path, &reason);
            Ok(Settings::default())
        }
    }
}

/// Validates and normalizes `settings`, then writes them to `path` (creating its directory) through
/// a temporary file and a rename. Returns what was stored.
pub fn save(path: &Path, settings: Settings) -> Result<Settings, SettingsError> {
    let settings = settings.prepared()?;

    let mut json = serde_json::to_string_pretty(&settings).map_err(io::Error::other)?;
    json.push('\n');

    write_atomically(path, json.as_bytes())?;

    Ok(settings)
}

/// Reads the file, or fails with `InvalidData` when it is larger than [`MAX_FILE_BYTES`].
fn read_limited(path: &Path) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;

    Ok(bytes)
}

fn parse(bytes: &[u8]) -> Result<Settings, String> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("the file is too large".to_owned());
    }

    let settings: Settings =
        serde_json::from_slice(bytes).map_err(|error| format!("not valid settings JSON: {error}"))?;

    settings.prepared().map_err(|invalid| invalid.to_string())
}

/// Renames a settings file that cannot be used to `<name>.bak` so the user's data is not lost.
fn move_aside(path: &Path, reason: &str) {
    let backup = sibling(path, ".bak");

    match fs::rename(path, &backup) {
        Ok(()) => tracing::warn!(
            reason,
            "the settings file is invalid; kept as a backup, using the defaults"
        ),
        Err(error) => {
            tracing::warn!(reason, %error, "the settings file is invalid and cannot be moved aside; using the defaults")
        }
    }
}

fn write_atomically(path: &Path, contents: &[u8]) -> io::Result<()> {
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory)?;
    }

    let temporary = sibling(path, ".tmp");

    let written = write_synced(&temporary, contents).and_then(|()| fs::rename(&temporary, path));
    if written.is_err() {
        fs::remove_file(&temporary).ok();
    }

    written
}

fn write_synced(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(contents)?;

    file.sync_all()
}

/// `path` with `suffix` appended to its file name.
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);

    PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::test_support::TempDir;

    fn settings_file(directory: &TempDir) -> PathBuf {
        directory.path().join(SETTINGS_FILE)
    }

    fn with(change: impl FnOnce(&mut Settings)) -> Settings {
        let mut settings = Settings::default();
        change(&mut settings);

        settings
    }

    fn rejected_field(settings: Settings) -> &'static str {
        settings.prepared().expect_err("settings are invalid").field
    }

    #[test]
    fn the_defaults_are_the_shared_fixture() {
        let fixture: Value =
            serde_json::from_str(include_str!("../fixtures/settings-default.json")).expect("fixture is JSON");

        assert_eq!(
            serde_json::to_value(Settings::default()).expect("serializable"),
            fixture
        );
        assert_eq!(Settings::default().prepared(), Ok(Settings::default()));
    }

    #[test]
    fn saved_settings_load_back_unchanged() {
        let directory = TempDir::new("settings-round-trip");
        let path = settings_file(&directory);
        let settings = Settings {
            language: "pt-BR".to_owned(),
            theme: "light".to_owned(),
            question_count: 100,
            timer_minutes: 0,
            test_style: "true-false".to_owned(),
            topics: vec!["agents".to_owned(), "prompting-basics".to_owned()],
            difficulties: vec!["basic".to_owned(), "advanced".to_owned()],
            shuffle_questions: false,
            shuffle_options: false,
            check_for_updates: false,
            ..Settings::default()
        };

        let saved = save(&path, settings.clone()).expect("saves");

        assert_eq!(saved, settings);
        assert_eq!(load(&path).expect("loads"), settings);
    }

    #[test]
    fn saving_writes_camel_case_json_and_leaves_no_temporary_file() {
        let directory = TempDir::new("settings-file");
        let path = settings_file(&directory);

        save(&path, Settings::default()).expect("saves");

        let stored: Value = serde_json::from_str(&fs::read_to_string(&path).expect("file")).expect("JSON");
        assert_eq!(stored["questionCount"], json!(20));

        let names: Vec<_> = fs::read_dir(directory.path())
            .expect("directory")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(names, [SETTINGS_FILE]);
    }

    #[test]
    fn saving_creates_the_missing_directory() {
        let directory = TempDir::new("settings-mkdir");
        let path = directory.path().join("nested").join("config").join(SETTINGS_FILE);

        save(&path, Settings::default()).expect("saves");

        assert_eq!(load(&path).expect("loads"), Settings::default());
    }

    #[test]
    fn saving_replaces_the_previous_settings() {
        let directory = TempDir::new("settings-replace");
        let path = settings_file(&directory);

        save(&path, with(|settings| settings.question_count = 10)).expect("first save");
        save(&path, with(|settings| settings.question_count = 50)).expect("second save");

        assert_eq!(load(&path).expect("loads").question_count, 50);
    }

    #[test]
    fn a_missing_file_gives_the_defaults() {
        let directory = TempDir::new("settings-missing");

        assert_eq!(load(&settings_file(&directory)).expect("loads"), Settings::default());
    }

    #[test]
    fn missing_fields_take_defaults_and_unknown_fields_are_ignored() {
        let directory = TempDir::new("settings-partial");
        let path = settings_file(&directory);
        fs::write(
            &path,
            r#"{ "questionCount": 7, "accentColor": "teal", "futureOption": { "a": 1 } }"#,
        )
        .expect("write");

        let loaded = load(&path).expect("loads");

        assert_eq!(loaded, with(|settings| settings.question_count = 7));
        assert!(!sibling(&path, ".bak").exists(), "a usable file is not moved aside");
    }

    #[test]
    fn a_file_without_a_theme_uses_the_system_theme() {
        let directory = TempDir::new("settings-no-theme");
        let path = settings_file(&directory);
        fs::write(&path, r#"{ "version": 1, "language": "en", "questionCount": 7 }"#).expect("write");

        let loaded = load(&path).expect("loads");

        assert_eq!(loaded.theme, "system");
        assert!(!sibling(&path, ".bak").exists(), "a usable file is not moved aside");
    }

    #[test]
    fn a_stored_theme_is_loaded() {
        let directory = TempDir::new("settings-theme");
        let path = settings_file(&directory);
        fs::write(&path, r#"{ "theme": "dark" }"#).expect("write");

        assert_eq!(load(&path).expect("loads").theme, "dark");
    }

    #[test]
    fn loading_normalizes_what_the_file_holds() {
        let directory = TempDir::new("settings-load-normalize");
        let path = settings_file(&directory);
        fs::write(
            &path,
            r#"{ "topics": ["b", "a", "b"], "difficulties": ["advanced", "basic", "basic"] }"#,
        )
        .expect("write");

        let loaded = load(&path).expect("loads");

        assert_eq!(loaded.topics, ["a", "b"]);
        assert_eq!(loaded.difficulties, ["basic", "advanced"]);
    }

    #[test]
    fn a_file_that_is_not_valid_settings_is_kept_as_a_backup_and_the_defaults_are_used() {
        let broken = [
            ("not json", "this is not json".to_owned()),
            ("wrong type", r#"{ "questionCount": "many" }"#.to_owned()),
            ("not an object", "[1, 2, 3]".to_owned()),
            ("rule broken", r#"{ "questionCount": 4 }"#.to_owned()),
            ("wrong version", r#"{ "version": 2 }"#.to_owned()),
            ("unknown theme", r#"{ "theme": "sepia" }"#.to_owned()),
            ("too large", " ".repeat(MAX_FILE_BYTES as usize + 1)),
        ];

        for (label, contents) in broken {
            let directory = TempDir::new("settings-corrupt");
            let path = settings_file(&directory);
            fs::write(&path, &contents).expect("write");

            let loaded = load(&path).expect(label);

            assert_eq!(loaded, Settings::default(), "{label}");
            assert!(!path.exists(), "{label}: the broken file is moved away");
            assert_eq!(
                fs::read_to_string(sibling(&path, ".bak")).expect(label),
                contents,
                "{label}"
            );
        }
    }

    #[test]
    fn a_new_backup_replaces_an_older_one() {
        let directory = TempDir::new("settings-backup-replaced");
        let path = settings_file(&directory);
        let backup = sibling(&path, ".bak");
        fs::write(&backup, "old backup").expect("write");
        fs::write(&path, "{ broken").expect("write");

        load(&path).expect("loads");

        assert_eq!(fs::read_to_string(&backup).expect("backup"), "{ broken");
    }

    #[test]
    fn a_settings_path_that_cannot_be_read_is_an_io_error() {
        let directory = TempDir::new("settings-unreadable");
        let path = settings_file(&directory);
        fs::create_dir(&path).expect("a directory where the file should be");

        assert!(matches!(load(&path), Err(SettingsError::Io(_))));
        assert!(path.is_dir(), "nothing is moved aside");
    }

    #[test]
    fn every_bound_is_enforced_and_names_its_field() {
        let cases: Vec<(&str, Settings)> = vec![
            ("version", with(|settings| settings.version = 2)),
            ("version", with(|settings| settings.version = 0)),
            ("language", with(|settings| settings.language = String::new())),
            ("language", with(|settings| settings.language = "e".to_owned())),
            ("language", with(|settings| settings.language = "EN".to_owned())),
            ("language", with(|settings| settings.language = "english".to_owned())),
            ("language", with(|settings| settings.language = "en-".to_owned())),
            ("language", with(|settings| settings.language = "en-B".to_owned())),
            (
                "language",
                with(|settings| settings.language = "en-Latn-US-x-private".to_owned()),
            ),
            ("language", with(|settings| settings.language = "en_US".to_owned())),
            ("theme", with(|settings| settings.theme = "Dark".to_owned())),
            ("theme", with(|settings| settings.theme = String::new())),
            ("theme", with(|settings| settings.theme = "auto".to_owned())),
            ("questionCount", with(|settings| settings.question_count = 4)),
            ("questionCount", with(|settings| settings.question_count = 101)),
            ("questionCount", with(|settings| settings.question_count = i64::MAX)),
            ("timerMinutes", with(|settings| settings.timer_minutes = -1)),
            ("timerMinutes", with(|settings| settings.timer_minutes = 181)),
            ("testStyle", with(|settings| settings.test_style = "random".to_owned())),
            ("testStyle", with(|settings| settings.test_style = String::new())),
            ("topics", with(|settings| settings.topics = vec!["Agents".to_owned()])),
            ("topics", with(|settings| settings.topics = vec![String::new()])),
            ("topics", with(|settings| settings.topics = vec!["a--b".to_owned()])),
            ("topics", with(|settings| settings.topics = vec!["-a".to_owned()])),
            ("topics", with(|settings| settings.topics = vec!["a".repeat(65)])),
            (
                "topics",
                with(|settings| settings.topics = (0..201).map(|index| format!("topic-{index}")).collect()),
            ),
            (
                "difficulties",
                with(|settings| settings.difficulties = vec!["expert".to_owned()]),
            ),
        ];

        for (field, settings) in cases {
            let description = format!("{settings:?}");

            assert_eq!(rejected_field(settings), field, "{description}");
        }
    }

    #[test]
    fn the_edges_of_every_bound_are_accepted() {
        let accepted = [
            with(|settings| settings.language = "pt-BR".to_owned()),
            with(|settings| settings.language = "fil".to_owned()),
            with(|settings| settings.language = "zh-Hant-TW".to_owned()),
            with(|settings| settings.theme = "light".to_owned()),
            with(|settings| settings.theme = "dark".to_owned()),
            with(|settings| settings.question_count = 5),
            with(|settings| settings.question_count = 100),
            with(|settings| settings.timer_minutes = 0),
            with(|settings| settings.timer_minutes = 180),
            with(|settings| settings.topics = vec!["a".repeat(64)]),
            with(|settings| settings.topics = (0..200).map(|index| format!("topic-{index}")).collect()),
            with(|settings| settings.test_style = "multi".to_owned()),
            with(|settings| settings.difficulties = ["basic", "intermediate", "advanced"].map(str::to_owned).to_vec()),
        ];

        for settings in accepted {
            let description = format!("{settings:?}");

            assert!(settings.prepared().is_ok(), "{description}");
        }
    }

    #[test]
    fn invalid_settings_are_not_written() {
        let directory = TempDir::new("settings-invalid-save");
        let path = settings_file(&directory);

        let error = save(&path, with(|settings| settings.timer_minutes = 500)).expect_err("rejected");

        assert!(matches!(
            error,
            SettingsError::Invalid(Invalid {
                field: "timerMinutes",
                ..
            })
        ));
        assert!(!path.exists());
    }

    #[test]
    fn normalizing_sorts_and_deduplicates_topics_and_difficulties() {
        let settings = with(|settings| {
            settings.topics = ["tools", "agents", "tools", "agents", "mcp"]
                .map(str::to_owned)
                .to_vec();
            settings.difficulties = ["advanced", "basic", "advanced", "intermediate"]
                .map(str::to_owned)
                .to_vec();
        });

        let normalized = settings.normalize();

        assert_eq!(normalized.topics, ["agents", "mcp", "tools"]);
        assert_eq!(normalized.difficulties, ["basic", "intermediate", "advanced"]);
    }

    #[test]
    fn saving_returns_the_normalized_settings() {
        let directory = TempDir::new("settings-save-normalized");
        let path = settings_file(&directory);

        let saved = save(
            &path,
            with(|settings| settings.topics = ["b", "a", "b"].map(str::to_owned).to_vec()),
        )
        .expect("saves");

        assert_eq!(saved.topics, ["a", "b"]);
        assert_eq!(load(&path).expect("loads"), saved);
    }
}
