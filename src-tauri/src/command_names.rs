// Single source of truth for the app's IPC command names. `build.rs` includes this file (it
// generates the `allow-<command>` permissions from it) and the tests compare it with the
// capability and the registered handler.

/// Every `#[tauri::command]` in `src/commands`.
pub const COMMANDS: &[&str] = &[
    "settings_load",
    "settings_save",
    "data_load",
    "data_save",
    "update_check",
    "update_install",
    "app_relaunch",
    "open_url",
];
