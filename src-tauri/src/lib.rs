//! Harness Test Portal: the app shell. It shows the quiz frontend in a native window, stores the
//! user's settings, opens links in the browser, and updates itself. The quiz itself lives in the
//! frontend; the shell adds only these as IPC commands.

#[cfg(test)]
mod command_names;
mod commands;
mod error;
mod logging;
mod settings;
#[cfg(test)]
mod test_support;
mod update;
mod updates;
mod window;

use std::process::ExitCode;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use crate::commands::settings::SettingsStore;
use crate::settings::SETTINGS_FILE;
use crate::updates::Updates;

/// Registers every IPC command; `command_names.rs` lists the same ones for the ACL.
fn invoke_handler<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::settings::settings_load,
        commands::settings::settings_save,
        commands::updates::update_check,
        commands::updates::update_install,
        commands::updates::app_relaunch,
        commands::links::open_url,
    ]
}

/// Builds and runs the app until it quits.
pub fn run() -> ExitCode {
    let result = tauri::Builder::default()
        // Must be registered first so a second launch exits before anything else starts.
        // Its argv is ignored: nothing from another process is forwarded to the webview.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::focus_main_window(app);
        }))
        // Size, position and so on, but not visibility: the window is always shown on start.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(logging::plugin())
        // Driven from the update commands only; its own JS commands are not granted to the webview.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(Updates::from_config(app.config()));
            app.manage(SettingsStore::new(app.path().app_config_dir()?.join(SETTINGS_FILE)));
            window::create_main_window(app)?;

            let version = app.package_info().version.to_string();
            tracing::info!(%version, "Harness Test Portal started");

            Ok(())
        })
        .invoke_handler(invoke_handler())
        .build(tauri::generate_context!());

    match result {
        Ok(app) => {
            app.run(|_app, _event| {});
            ExitCode::SUCCESS
        }
        Err(error) => {
            // The logger may not be running yet, so report on stderr as well.
            eprintln!("Harness Test Portal failed: {error}");
            tracing::error!(%error, "application failed");

            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use serde_json::Value;
    use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
    use tauri::test::{INVOKE_KEY, mock_builder};
    use tauri::webview::InvokeRequest;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    use super::*;
    use crate::command_names::COMMANDS;
    use crate::test_support::TempDir;

    fn read_json(text: &str) -> Value {
        serde_json::from_str(text).expect("valid JSON")
    }

    fn shipped_config() -> Value {
        read_json(include_str!("../tauri.conf.json"))
    }

    /// An app with the shipped capability and ACL, the app's state, and `handler` registered. Its
    /// main window loads the bundled frontend, so the commands are called as the page would.
    fn app_with(
        handler: impl Fn(tauri::ipc::Invoke<tauri::test::MockRuntime>) -> bool + Send + Sync + 'static,
    ) -> (
        tauri::App<tauri::test::MockRuntime>,
        tauri::WebviewWindow<tauri::test::MockRuntime>,
        TempDir,
    ) {
        let directory = TempDir::new("handler");

        let app = mock_builder()
            .manage(Updates::new(None))
            .manage(SettingsStore::new(directory.path().join(SETTINGS_FILE)))
            .invoke_handler(handler)
            .build(tauri::generate_context!())
            .expect("mock app");
        let window = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .expect("mock window");

        (app, window, directory)
    }

    /// What the page receives when it calls `command` without arguments.
    fn call(
        window: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        command: &str,
    ) -> Result<InvokeResponseBody, Value> {
        let request = InvokeRequest {
            cmd: command.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().expect("URL"),
            body: InvokeBody::Json(serde_json::json!({})),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        };

        tauri::test::get_ipc_response(window, request)
    }

    fn is_missing_from_handler(answer: &Result<InvokeResponseBody, Value>) -> bool {
        matches!(answer, Err(Value::String(message)) if message.starts_with("Command ") && message.ends_with(" not found"))
    }

    #[test]
    fn the_capability_grants_exactly_the_registered_commands_to_the_main_window() {
        let capability = read_json(include_str!("../capabilities/default.json"));

        let granted: BTreeSet<String> = capability["permissions"]
            .as_array()
            .expect("permissions")
            .iter()
            .map(|permission| permission.as_str().expect("permission").to_owned())
            .collect();
        let expected: BTreeSet<String> = COMMANDS
            .iter()
            .map(|command| format!("allow-{}", command.replace('_', "-")))
            .collect();

        assert_eq!(granted, expected);
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        assert_eq!(capability["local"], Value::Bool(true));
        assert!(capability.get("remote").is_none(), "no remote origin gets commands");
    }

    /// `app_relaunch` is not called: it would restart the process running the tests.
    #[test]
    fn every_listed_command_is_registered_and_allowed_for_the_main_window() {
        let (_app, window, _directory) = app_with(invoke_handler());

        for command in COMMANDS.iter().filter(|command| **command != "app_relaunch") {
            let answer = call(&window, command);

            assert!(
                !is_missing_from_handler(&answer),
                "{command} is not registered: {answer:?}"
            );
            assert!(
                !matches!(&answer, Err(Value::String(message)) if message.contains("not allowed")),
                "{command} is not allowed for the main window: {answer:?}"
            );
        }
    }

    #[test]
    fn a_command_left_out_of_the_handler_is_reported_missing() {
        // Guards the check above: with one command registered, the others are told apart.
        let (_app, window, _directory) = app_with(tauri::generate_handler![commands::settings::settings_load]);

        assert!(!is_missing_from_handler(&call(&window, "settings_load")));
        let answer = call(&window, "open_url");
        assert!(is_missing_from_handler(&answer), "{answer:?}");
    }

    #[test]
    fn the_shipped_csp_runs_no_inline_or_eval_script() {
        let config = shipped_config();

        for key in ["csp", "devCsp"] {
            let policy = config["app"]["security"][key].as_str().expect(key);
            let script_src = policy
                .split(';')
                .map(str::trim)
                .find(|directive| directive.starts_with("script-src"))
                .expect("a script-src directive");

            assert!(!script_src.contains("'unsafe-eval'"), "{key}: {script_src}");
            assert!(!script_src.contains("'unsafe-inline'"), "{key}: {script_src}");
            assert!(!policy.contains("'unsafe-eval'"), "{key}");
        }
    }

    #[test]
    fn the_shipped_csp_allows_only_the_apps_own_origin_and_ipc() {
        let policy = shipped_config()["app"]["security"]["csp"]
            .as_str()
            .expect("csp")
            .to_owned();

        assert!(policy.contains("default-src 'self'"));
        assert!(policy.contains("connect-src ipc: http://ipc.localhost;"));
        assert!(!policy.contains("localhost:5173"), "the dev server is only in devCsp");
        assert!(!policy.contains("http://*") && !policy.contains("https:"));
    }
}
