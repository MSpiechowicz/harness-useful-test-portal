//! Opening links in the default browser.
//!
//! The only way the app opens an address: the page asks through `open_url`, and the window's
//! navigation and pop-up guards use the same rules, so the browser is never handed anything but a
//! plain `https` address.

use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

use crate::error::{CommandError, CommandResult, ErrorCode};

/// Longest address accepted.
const MAX_URL_BYTES: usize = 2048;

/// Opens `url` in the default browser: `https` only, with a host and without a user name or
/// password. Anything else is `invalidInput`.
#[tauri::command]
pub async fn open_url<R: Runtime>(app: AppHandle<R>, url: String) -> CommandResult<()> {
    open_external(&app, &url)
}

/// Opens `url` like [`open_url`].
pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &str) -> CommandResult<()> {
    let url = parse_external(url)?;

    app.opener().open_url(url.as_str(), None::<&str>).map_err(|error| {
        tracing::warn!(%error, host = url.host_str().unwrap_or_default(), "cannot open a link in the browser");
        CommandError::new(ErrorCode::Io, "cannot open the link in the browser")
    })
}

/// The address when it may be opened externally.
pub fn parse_external(url: &str) -> CommandResult<Url> {
    let invalid = |message: &str| CommandError::new(ErrorCode::InvalidInput, message);

    if url.len() > MAX_URL_BYTES {
        return Err(invalid("the address is too long"));
    }

    let parsed = Url::parse(url).map_err(|_| invalid("the address is not a valid URL"))?;

    if parsed.scheme() != "https" {
        return Err(invalid("only https addresses can be opened"));
    }

    if parsed.host_str().is_none_or(str::is_empty) {
        return Err(invalid("the address has no host"));
    }

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(invalid("the address must not contain a user name or password"));
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_https_addresses_are_accepted() {
        for url in [
            "https://example.com",
            "https://docs.example.com/guide?a=1#top",
            "https://example.com:8443/x",
            "HTTPS://Example.com/",
        ] {
            assert!(parse_external(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn everything_else_is_invalid_input() {
        let rejected = [
            "http://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "mailto:someone@example.com",
            "tauri://localhost/",
            "ftp://example.com/file",
            "https://user@example.com/",
            "https://user:secret@example.com/",
            "https://:secret@example.com/",
            "https://",
            "example.com",
            "/relative/path",
            "",
        ];

        for url in rejected {
            let error = parse_external(url).expect_err(url);

            assert_eq!(error.code(), ErrorCode::InvalidInput, "{url}");
        }
    }

    #[test]
    fn very_long_addresses_are_refused() {
        let url = format!("https://example.com/{}", "a".repeat(MAX_URL_BYTES));

        assert_eq!(
            parse_external(&url).expect_err("too long").code(),
            ErrorCode::InvalidInput
        );
    }
}
