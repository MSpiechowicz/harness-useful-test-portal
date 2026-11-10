# Releases and updater keys

Releases are fully automated from Conventional Commits. The only manual work is a one-time key setup (below).

## How a release happens

1. **Commit messages decide the version.** On `main`, `fix:` releases a patch, `feat:` a minor, and a
   `BREAKING CHANGE:` footer or `feat!:` a major. Other types (`chore:`, `docs:`, `test:`, ...) do not release.
   Content-only changes use the `content` scope: `feat(content): ...` (new questions or topics) and
   `fix(content): ...` (corrections) both release, so shipped questions reach installed apps through the updater.
2. **CI runs** on the push to `main` (`.github/workflows/ci.yml`): type checks, lint, tests, content validation and the
   frontend build, plus rustfmt, clippy and the Rust tests of the Tauri shell on three OSes.
3. **`Release` workflow** (`.github/workflows/release.yml`) starts when CI finishes successfully for a push to `main`
   (`workflow_run`). It can also be started by hand with `workflow_dispatch` on `main`.
4. **Job `release`** first checks that the updater key is set up (see below), then runs `semantic-release`
   (config: `.releaserc.json`). If there is something to release it:
   - writes `CHANGELOG.md`;
   - bumps `package.json` (npm plugin, no publishing) and, through `scripts/set-version.ts`, the Rust workspace
     version in `Cargo.toml` and the workspace entry (`harness_test_portal_app`) in `Cargo.lock`.
     `src-tauri/tauri.conf.json` reads its version from `package.json`;
   - commits them as `chore(release): X.Y.Z [skip ci]`, pushes the commit and the tag `vX.Y.Z`;
   - creates a **draft** GitHub release with the generated notes.

   The job exposes the outputs `released` and `version`. They are written by the exec plugin's `successCmd`, which
   appends to `$GITHUB_OUTPUT` only after the release really happened. If nothing is released (or the run was
   stale because `main` moved on), the outputs stay empty and the later jobs are skipped.

5. **Job `bundle`** (only when `released == 'true'`) checks out the tag `vX.Y.Z` and builds on four matrix entries
   with `tauri-apps/tauri-action`, uploading to the draft release and merging `latest.json` (the updater manifest).
   Tauri's `beforeBuildCommand` (`bun run build`) validates the content and builds the frontend that the bundles embed.

   | Runner                               | Output                        |
   | ------------------------------------ | ----------------------------- |
   | ubuntu-22.04                         | AppImage, deb, rpm for x86_64 |
   | macos-latest, `aarch64-apple-darwin` | app, dmg                      |
   | macos-latest, `x86_64-apple-darwin`  | app, dmg                      |
   | windows-latest                       | NSIS installer, MSI           |

6. **Job `publish`** checks that `latest.json` is complete, writes `checksums.txt` over every asset, attests the build
   provenance of every asset and runs `gh release edit vX.Y.Z --draft=false --latest`.
   If any bundle fails, the release stays a draft: fix the cause, then re-run the failed jobs from the Actions page
   (do not re-run `release`, the tag already exists) and `publish` follows.

Releases are serialized (`concurrency: release`, never cancelled).

Repository settings required: Actions must be allowed to write (`Settings > Actions > General > Workflow
permissions`: read and write), and, if `main` is protected, the release commit push must be permitted for
`github-actions[bot]` (or protection must allow it). `GITHUB_TOKEN` pushes do not start other workflows, the
`[skip ci]` marker is an extra guard.

## One-time setup (you do this, locally)

Updater artifacts are signed with a Tauri signing key. The private key never goes into the repository. Until the
key pair is set up the release workflow refuses to run.

1. Generate the key pair (choose a password when asked):

   ```sh
   bunx tauri signer generate -w ~/.tauri/harness-test-portal.key
   ```

   This writes the private key to `~/.tauri/harness-test-portal.key` and the public key to
   `~/.tauri/harness-test-portal.key.pub`. Back both up somewhere safe: **if the private key is lost, installed apps
   can never update again** (the public key is baked into every installed build). Never commit, paste or log the
   private key.

2. Add repository secrets (`Settings > Secrets and variables > Actions > New repository secret`):
   - `TAURI_SIGNING_PRIVATE_KEY`: the full content of `~/.tauri/harness-test-portal.key` (paste the content, a file
     path is not usable in CI);
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password you chose.
3. Put the **public** key (content of `~/.tauri/harness-test-portal.key.pub`, a single base64 line) into
   `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`, replacing the `NOT_CONFIGURED...` placeholder. The
   public key is safe to commit. Until it is replaced, builds start normally but have updates off (the app shows
   that updates are unavailable), and the release job fails before any tag is created. The same section pins the
   endpoint (the GitHub release `latest.json`, HTTPS only) and sets `requireSignedVersion: true`: an update installs
   only when its signature verifies with this key, was made for the version `latest.json` announces, and that
   version is newer than the running one. `tauri build` (tauri-action in CI) binds every signature to the app version
   automatically. If you ever sign an artifact by hand (`tauri signer sign`), pass `--app-version X.Y.Z`, or the app
   rejects the update.

`bundle.createUpdaterArtifacts` is `true`, so a bundling build (`bun run build:app`) needs
`TAURI_SIGNING_PRIVATE_KEY` (and its password) in the environment, CI has them as secrets. Local builds without
the key use `bunx tauri build --no-bundle`, or `--config '{"bundle":{"createUpdaterArtifacts":false}}'` to bundle
unsigned.

Rotating the key means shipping one release signed by the old key that carries the new public key. After that the
old key can be retired.

## What users get

### Linux

| Format   | Notes                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AppImage | Portable (`chmod +x` and run). The installer puts it in `~/.local/lib/harness-test-portal/`. The in-app updater replaces the AppImage file in place, no password needed.  |
| deb      | `sudo apt install ./harness-test-portal_X.Y.Z_amd64.deb`. The in-app updater installs the new `.deb` after the system's administrator prompt (pkexec, or zenity/kdialog). |
| rpm      | `sudo dnf install ./harness-test-portal-X.Y.Z-1.x86_64.rpm`. Same as deb, with `rpm -U`.                                                                                  |

Every format updates in-app: each build knows how it was installed and downloads the matching artifact
(`latest.json` lists `linux-x86_64-appimage`, `-deb` and `-rpm`, Linux is x86_64 only). Every download is
signature-checked before the package manager sees it. Installing the new package by hand works too.

## Release safeguards

- The release job fails before any tag is created when `plugins.updater.pubkey` is still the placeholder or does
  not decode to a minisign public key, or the `TAURI_SIGNING_PRIVATE_KEY` secret is missing, so no release can ship
  that installs but never updates.
- The bundle jobs merge their entries into one `latest.json`, and two jobs finishing at the same moment can drop
  each other's entries. The publish job checks that `latest.json` announces the release version and has a signed
  HTTPS entry for every platform and installer type before un-drafting. If it fails, the release stays a draft:
  re-run the bundle job of the missing platform (it merges its entries again), then re-run the publish job.
- The publish job attests the build provenance of every release asset, checksums included. Check one with
  `gh attestation verify <file> --repo MSpiechowicz/harness-useful-test-portal`.

### macOS and Windows: unsigned installers

Decision: the OS installers are **not** code-signed or notarized (no Apple Developer ID or Windows certificate).
Updates are still signature-verified by the Tauri updater key, so auto-update is safe, only the first install shows
an OS warning.

- **macOS (Gatekeeper)**: "Harness Test Portal can't be opened because Apple cannot check it for malicious software".
  Open the dmg, drag the app to Applications, then right-click the app and choose **Open**, then **Open** again.
  If macOS still refuses (macOS 15 and later): `System Settings > Privacy & Security`, scroll to the message about
  Harness Test Portal and click **Open Anyway**. Terminal alternative:
  `xattr -dr com.apple.quarantine "/Applications/Harness Test Portal.app"`. The shell installer clears the quarantine
  itself.
- **Windows (SmartScreen)**: "Windows protected your PC". Click **More info**, then **Run anyway**. The PowerShell
  installer avoids the prompt for the setup file.

Files downloaded by the in-app updater are not quarantined, so later updates do not show the warning again.
