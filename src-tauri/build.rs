//! Build script: generates the Tauri context and the app ACL manifest.
//!
//! Listing the commands in an [`AppManifest`] makes Tauri generate `allow-<command>` /
//! `deny-<command>` permissions for them and enforce the ACL on app commands. The static
//! capability `capabilities/default.json` grants them to the main window.

use tauri_build::{AppManifest, Attributes};

// `COMMANDS`: keep `generate_handler!` in `src/lib.rs` and `capabilities/default.json` in sync;
// a test checks all three.
include!("src/command_names.rs");

fn main() {
    let attributes = Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS));

    if let Err(error) = tauri_build::try_build(attributes) {
        // Build scripts report failures by panicking; `{error:#}` keeps the whole cause chain.
        panic!("tauri build script failed: {error:#}");
    }
}
