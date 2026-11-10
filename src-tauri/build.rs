//! Build script: generates the Tauri context and the app ACL manifest.
//!
//! Listing the commands in an [`AppManifest`] makes Tauri generate `allow-<command>` /
//! `deny-<command>` permissions for them and enforce the ACL on app commands. The static
//! capability `capabilities/default.json` grants them to the main window.

use std::env;
use std::path::PathBuf;

use tauri_build::{AppManifest, Attributes, WindowsAttributes};

// `COMMANDS`: keep `generate_handler!` in `src/lib.rs` and `capabilities/default.json` in sync;
// a test checks all three.
include!("src/command_names.rs");

fn main() {
    let mut attributes = Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS));

    if embeds_windows_manifest() {
        // Tauri puts its Windows application manifest (Common Controls v6) only into the app
        // binary, so the unit-test binary would not start (STATUS_ENTRYPOINT_NOT_FOUND). The linker
        // embeds the same manifest into every binary of this package instead.
        attributes = attributes.windows_attributes(WindowsAttributes::new_without_app_manifest());
        link_windows_manifest();
    }

    if let Err(error) = tauri_build::try_build(attributes) {
        // Build scripts report failures by panicking; `{error:#}` keeps the whole cause chain.
        panic!("tauri build script failed: {error:#}");
    }
}

/// Whether the target links with MSVC on Windows, the only linker these manifest flags are for.
fn embeds_windows_manifest() -> bool {
    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let environment = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    os == "windows" && environment == "msvc"
}

fn link_windows_manifest() {
    let directory = env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR");
    let manifest = PathBuf::from(directory).join("windows-app-manifest.xml");

    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    // A manifest that cannot be embedded fails the build instead of leaving a binary without one.
    println!("cargo:rustc-link-arg=/WX");
}
