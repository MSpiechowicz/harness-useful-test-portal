# Harness Test Portal

**Practice tests for AI and LLM engineering, in one local desktop app.** Pick topics and difficulty, take a timed
quiz or practise without a timer, and see your score with an explanation and sources for every question. Everything
runs on your machine: no account, no telemetry, no network content fetching. Your history and any unfinished test are
saved locally.

Part of the [harness-useful](https://github.com/MSpiechowicz/harness-useful) family.

## Features

- **Question types**: single choice, multiple choice (all or nothing) and true/false. An unanswered question counts as wrong.
- **Topics and difficulty**: choose any mix of topics and of basic, intermediate and advanced questions.
- **Timed or relaxed**: a countdown timer (30 minutes by default, or off), and a mixed, single, multi or true/false test style.
- **Explanations with sources**: every question explains the answer and links to its sources.
- **Practice mode**: no timer, and "Check answer" shows right or wrong, the explanation and the sources straight away.
- **Flags and shortcuts**: flag questions to review later. Keys: 1-9 pick an option, n or Right arrow next, p or Left
  arrow previous, f flag, c check (practice), Ctrl/Cmd+Enter submit, ? help.
- **Results**: your score as a percentage, with a review of every question, and a retry of only the questions you got wrong.
- **Resume**: an unfinished test is saved, and you can resume it from Home after leaving the quiz or restarting the app. The timer stops while it is paused.
- **History**: every finished test is saved locally, with a summary, a score trend, per-topic mastery, an
  All/Exam/Practice filter and a Clear history button.
- **Updates**: the app updates itself from GitHub releases, with signature-checked packages.
- **Offline content**: questions ship inside the app as plain JSON files.

## Install

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/MSpiechowicz/harness-useful-test-portal/main/install.sh | sh
```

On Linux this installs the AppImage to `~/.local/lib/harness-test-portal/` and adds an applications-menu entry (x86_64
only, AppImages need `libfuse2`). On macOS it installs `~/Applications/Harness Test Portal.app`. The installer verifies
the download against the release's SHA-256 checksums and installs nothing when they do not match.

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/MSpiechowicz/harness-useful-test-portal/main/install.ps1 | iex"
```

This runs the release's installer for the current user, with a Start menu shortcut.

Installer options (environment variables): `HARNESS_TEST_PORTAL_VERSION=v1.0.0` pins a release, and
`HARNESS_TEST_PORTAL_NO_SHORTCUT=1` skips the Linux applications-menu entry.

You can also download the AppImage, deb, rpm, dmg or Windows installers from the
[releases page](https://github.com/MSpiechowicz/harness-useful-test-portal/releases). The installers are not
code-signed, see [docs/release-and-updater-keys.md](docs/release-and-updater-keys.md) for the first-launch warnings.

## Settings

| Setting                     | Default    | Notes                                                           |
| --------------------------- | ---------- | --------------------------------------------------------------- |
| Language                    | English    | Only English ships, the structure for more is in place          |
| Questions per test          | 20         | 5 to 100, limited to the questions available for your selection |
| Timer                       | 30 minutes | 0 to 180, 0 turns the timer off                                 |
| Test style                  | Mixed      | Mixed, single choice, multiple choice or true/false             |
| Topics                      | All        | Any subset of the topics                                        |
| Difficulty                  | All        | Any subset of basic, intermediate and advanced                  |
| Shuffle questions / options | On         |                                                                 |
| Check for updates           | On         |                                                                 |

Settings are stored as a JSON file in the app's data directory. Next to it the app keeps `history.json` and
`session.json` (your finished tests and the unfinished one, each at most 2 MiB). In a plain browser (`bun run dev`) the
same data goes to localStorage. A damaged file is kept as `<name>.bak` instead of being overwritten.

## Development

Requirements: [Bun](https://bun.sh) 1.4, a stable Rust toolchain (pinned in `rust-toolchain.toml`) and the
[Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install
bun run dev:app      # the desktop app with hot reload
bun run dev          # only the web UI, at http://localhost:5173
```

Checks (the same ones CI runs):

```sh
bun run check
bun run lint
bun test
bun run content:validate
bun run content:schema --check
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

`bun run build:app` builds the installers. Bundling signs the updater artifacts, so it needs the signing key, see
[docs/release-and-updater-keys.md](docs/release-and-updater-keys.md).

## Adding questions

Questions are JSON files under `content/topics/<topic>/questions/`, validated by a schema. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the format, the scaffolding commands and the review rules.

## Releases

Releases are automated with [semantic-release](https://semantic-release.gitbook.io) from
[Conventional Commits](https://www.conventionalcommits.org) on `main`:

- `fix:` releases a patch, `feat:` a minor, `feat!:` or a `BREAKING CHANGE:` footer a major.
- Content-only changes use the `content` scope: `feat(content): add RAG questions` or `fix(content): correct an answer`.
  Both release, so new and corrected questions reach installed apps through the updater.
- `chore:`, `docs:`, `test:` and similar do not release.

Updater signing keys, the release pipeline and the unsigned-installer notes are in
[docs/release-and-updater-keys.md](docs/release-and-updater-keys.md).

## License

[GPL-3.0](LICENSE)
