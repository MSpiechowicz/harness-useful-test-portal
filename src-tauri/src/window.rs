//! The main window, created from its `tauri.conf.json` entry (`"create": false`) so that
//! navigation, pop-up and download guards are attached before any page loads.
//!
//! The window stays on the app's own pages: `tauri://localhost` (`http://tauri.localhost` on
//! Windows), plus the dev server in debug builds. Links to anywhere else never load in the app;
//! `https` ones open in the default browser (see `commands::links`), the rest are blocked.

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{App, AppHandle, Manager, Runtime, Url, Webview, WebviewWindow, WebviewWindowBuilder};

use crate::commands::links;

/// Label of the only window.
pub const MAIN_WINDOW: &str = "main";

/// Release builds suppress the webview's default context menu (Reload, Back, Inspect, ...) except
/// over editable fields and selected text, where Copy/Paste stay useful. Tauri has no setting
/// for this; initialization scripts are injected by the webview itself, outside the page CSP.
const CONTEXT_MENU_SCRIPT: &str = r#"
window.addEventListener('contextmenu', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const editable = target?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  const selected = (window.getSelection()?.toString() ?? '') !== '';
  if (!editable && !selected) {
    event.preventDefault();
  }
}, { capture: true });
"#;

/// Creates the main window with:
/// - a navigation guard that allows only the app's own pages (and the dev server in debug builds);
///   other `https` addresses open in the default browser;
/// - a pop-up guard that opens `window.open` / `target="_blank"` `https` links in the default
///   browser and never in the app;
/// - a download guard that refuses every download;
/// - the context-menu script in release builds.
pub fn create_main_window<R: Runtime>(app: &App<R>) -> tauri::Result<WebviewWindow<R>> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    // Only debug builds load the dev server, so only they trust its origin.
    let dev_url = if cfg!(debug_assertions) {
        app.config().build.dev_url.clone()
    } else {
        None
    };

    let navigation = app.handle().clone();
    let popups = app.handle().clone();

    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_navigation(move |url| allow_navigation(&navigation, url, dev_url.as_ref()))
        .on_new_window(move |url, _features| {
            open_outside(&popups, &url, "pop-up");
            NewWindowResponse::Deny
        })
        .on_download(refuse_download);

    if !cfg!(debug_assertions) {
        builder = builder.initialization_script(CONTEXT_MENU_SCRIPT);
    }

    builder.build()
}

/// Brings the main window to the front (second launch).
pub fn focus_main_window<R: Runtime, M: Manager<R>>(manager: &M) {
    let Some(window) = manager.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let raised = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus());

    if let Err(error) = raised {
        tracing::warn!(%error, "cannot focus the main window");
    }
}

fn allow_navigation<R: Runtime>(app: &AppHandle<R>, url: &Url, dev_url: Option<&Url>) -> bool {
    if is_own_page(url, dev_url) {
        return true;
    }

    open_outside(app, url, "navigation");
    false
}

/// True for the app's own pages: the bundled frontend and, when given, the dev server's origin.
fn is_own_page(url: &Url, dev_url: Option<&Url>) -> bool {
    is_bundled_page(url, cfg!(windows)) || dev_url.is_some_and(|dev_url| url.origin() == dev_url.origin())
}

/// The exact origin the bundled frontend is served from: `http://tauri.localhost` on Windows
/// (`useHttpsScheme` is off) and `tauri://localhost` elsewhere. Any other `*.localhost` origin
/// would resolve to loopback, i.e. to whatever local process listens there, so it is not trusted.
fn is_bundled_page(url: &Url, windows: bool) -> bool {
    let (scheme, host) = if windows {
        ("http", "tauri.localhost")
    } else {
        ("tauri", "localhost")
    };

    url.scheme() == scheme && url.host_str() == Some(host) && url.port().is_none()
}

/// Opens an `https` `url` in the default browser; anything else is only blocked.
fn open_outside<R: Runtime>(app: &AppHandle<R>, url: &Url, kind: &str) {
    if let Err(error) = links::open_external(app, url.as_str()) {
        tracing::warn!(
            kind,
            scheme = url.scheme(),
            host = url.host_str().unwrap_or_default(),
            "{error}"
        );
    }
}

/// The app exports nothing, so no download is allowed.
fn refuse_download<R: Runtime>(_webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    !matches!(event, DownloadEvent::Requested { .. })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).expect("valid URL")
    }

    fn dev() -> Url {
        url("http://localhost:5173")
    }

    #[test]
    fn only_the_platforms_bundled_origin_is_trusted() {
        for page in ["tauri://localhost/", "tauri://localhost/settings/"] {
            assert!(is_bundled_page(&url(page), false), "{page}");
            assert!(!is_bundled_page(&url(page), true), "{page}");
        }

        assert!(is_bundled_page(&url("http://tauri.localhost/quiz/"), true));
        assert!(!is_bundled_page(&url("http://tauri.localhost/quiz/"), false));

        for page in [
            "https://tauri.localhost/",
            "http://tauri.localhost:8080/",
            "http://other.localhost/",
        ] {
            assert!(!is_bundled_page(&url(page), true), "{page}");
            assert!(!is_bundled_page(&url(page), false), "{page}");
        }
    }

    #[test]
    fn the_bundled_frontend_is_the_apps_own_page_on_this_platform() {
        let page = if cfg!(windows) {
            "http://tauri.localhost/"
        } else {
            "tauri://localhost/"
        };

        assert!(is_own_page(&url(page), None));
    }

    #[test]
    fn other_addresses_are_not_the_apps_own_pages() {
        for page in [
            "https://example.com/",
            "http://localhost:5173/",
            "tauri://evil/",
            "https://tauri.localhost.example.com/",
            "http://tauri.localhost.evil.test/",
            "file:///etc/passwd",
            "blob:https://example.com/id",
            "javascript:alert(1)",
        ] {
            assert!(!is_own_page(&url(page), None), "{page}");
        }
    }

    #[test]
    fn the_dev_server_is_the_apps_own_page_only_when_given() {
        let page = url("http://localhost:5173/quiz");

        assert!(is_own_page(&page, Some(&dev())));
        assert!(!is_own_page(&page, None));
        assert!(!is_own_page(&url("http://localhost:5174/"), Some(&dev())));
        assert!(!is_own_page(&url("http://127.0.0.1:5173/"), Some(&dev())));
        assert!(!is_own_page(&url("https://localhost:5173/"), Some(&dev())));
    }
}
