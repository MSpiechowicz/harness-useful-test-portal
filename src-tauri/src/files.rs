//! File helpers shared by the stores that keep JSON in the app config directory.
//!
//! Writes go to a temporary file next to the target and are renamed over it, so a crash never
//! leaves a half-written file. A file that cannot be used is renamed to `<name>.bak` instead of
//! being overwritten or deleted, so the user's data is not lost.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

/// Reads the file, but at most `max_bytes + 1` bytes: a longer result tells the caller that the
/// file is over the limit without reading all of it.
pub(crate) fn read_limited(path: &Path, max_bytes: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(max_bytes + 1).read_to_end(&mut bytes)?;

    Ok(bytes)
}

/// Writes `contents` to `path` (creating its directory) through a temporary file and a rename.
pub(crate) fn write_atomically(path: &Path, contents: &[u8]) -> io::Result<()> {
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

pub(crate) fn write_synced(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(contents)?;

    file.sync_all()
}

/// Renames `path` to `<path>.bak`, replacing an older backup.
pub(crate) fn move_aside(path: &Path) -> io::Result<()> {
    fs::rename(path, sibling(path, ".bak"))
}

/// `path` with `suffix` appended to its file name.
pub(crate) fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);

    PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    #[test]
    fn reading_stops_one_byte_past_the_limit() {
        let directory = TempDir::new("files-limit");
        let path = directory.path().join("data.json");
        fs::write(&path, "0123456789").expect("write");

        assert_eq!(read_limited(&path, 10).expect("reads").len(), 10);
        assert_eq!(read_limited(&path, 4).expect("reads").len(), 5);
    }

    #[test]
    fn moving_aside_replaces_an_older_backup() {
        let directory = TempDir::new("files-aside");
        let path = directory.path().join("data.json");
        fs::write(sibling(&path, ".bak"), "old").expect("write");
        fs::write(&path, "new").expect("write");

        move_aside(&path).expect("moves");

        assert!(!path.exists());
        assert_eq!(fs::read_to_string(sibling(&path, ".bak")).expect("backup"), "new");
    }
}
