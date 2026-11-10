#!/bin/sh
# Harness Test Portal installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/MSpiechowicz/harness-useful-test-portal/main/install.sh | sh
#
# Installs the Harness Test Portal app. Linux gets the AppImage as
# ~/.local/lib/harness-test-portal/harness-test-portal.AppImage plus an applications-menu entry, macOS gets
# ~/Applications/Harness Test Portal.app. Both are the files the in-app updater replaces in place.
#
# Environment overrides:
#   HARNESS_TEST_PORTAL_VERSION       release tag to install (default: latest), e.g. v1.0.0
#   HARNESS_TEST_PORTAL_NO_SHORTCUT  set to 1 to skip the Linux applications-menu entry
set -eu

REPO="MSpiechowicz/harness-useful-test-portal"
BIN="harness-test-portal"
APP_NAME="Harness Test Portal"
VERSION="${HARNESS_TEST_PORTAL_VERSION:-latest}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but not installed"; }

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --https-only -O "$2" "$1"
  else
    fail "curl or wget is required"
  fi
}

# A download URL read from latest.json must point into this repository's releases. Dot segments (also percent-encoded)
# would walk out of that prefix, so they are refused.
require_release_url() {
  case "$1" in
    *..* | *%2[eE]*) fail "unexpected download URL in latest.json: $1" ;;
  esac

  case "$1" in
    "https://github.com/$REPO/releases/download/"*) ;;
    *) fail "unexpected download URL in latest.json: $1" ;;
  esac
}

# Nothing is installed without a checksum to compare against: verify the file $1 against the entry of $2 in checksums.txt.
# The name is compared literally, never as a pattern.
verify() {
  EXPECTED="$(awk -v name="$2" 'substr($0, length($1) + 3) == name { print $1; exit }' "$TMP/checksums.txt")"
  [ -n "$EXPECTED" ] || fail "checksums.txt has no entry for $2"
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL="$(sha256sum "$1" | awk '{print $1}')"
  else
    need shasum
    ACTUAL="$(shasum -a 256 "$1" | awk '{print $1}')"
  fi
  [ "$EXPECTED" = "$ACTUAL" ] || fail "checksum mismatch for $2"
}

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux) OS="linux" ;;
  *) fail "unsupported OS: $(uname -s). On Windows use install.ps1." ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ARCH="x86_64" ;;
  arm64 | aarch64) ARCH="aarch64" ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

# Rosetta: prefer the native arm64 build on Apple Silicon.
if [ "$OS" = "darwin" ] && [ "$ARCH" = "x86_64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
  ARCH="aarch64"
fi

# The keys of the release's latest.json (the updater manifest), which carries each bundle's download URL.
if [ "$OS" = "linux" ]; then
  # The Linux app is built for x86_64 only.
  [ "$ARCH" = "x86_64" ] || fail "the Linux app is x86_64 only. On arm64, build it from source (see the README)"
  PLATFORM="linux-$ARCH-appimage"
else
  PLATFORM="darwin-$ARCH-app"
fi

if [ "$VERSION" = "latest" ]; then
  BASE="https://github.com/$REPO/releases/latest/download"
else
  BASE="https://github.com/$REPO/releases/download/$VERSION"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

download "$BASE/latest.json" "$TMP/latest.json" || fail "no app release found at $BASE"
# One line, then the "url" inside this platform's object (an object holds no nested braces).
URL="$(tr -d '\n\r' <"$TMP/latest.json" | sed -n "s/.*\"$PLATFORM\"[[:space:]]*:[[:space:]]*{[^}]*\"url\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p")"
TAG="$(tr -d '\n\r' <"$TMP/latest.json" | sed -n 's/^[[:space:]]*{[[:space:]]*"version"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p')"
# The version only labels output and picks the icon's tag; drop anything that is not plain semver.
printf '%s' "$TAG" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' || TAG=""
[ -n "$URL" ] || fail "this release has no $PLATFORM build"
require_release_url "$URL"
ASSET="${URL##*/}"

info "Downloading $ASSET (${TAG:-$VERSION})"
download "$URL" "$TMP/$ASSET" || fail "download failed: $URL"

download "$BASE/checksums.txt" "$TMP/checksums.txt" 2>/dev/null || fail "this release has no checksums.txt, so $ASSET can't be verified. Nothing was installed"
verify "$TMP/$ASSET" "$ASSET"
info "Checksum verified"

if [ "$OS" = "linux" ]; then
  APP_DIR="$HOME/.local/lib/$BIN"
  APPIMAGE="$APP_DIR/$BIN.AppImage"
  mkdir -p "$APP_DIR"
  chmod +x "$TMP/$ASSET"
  # Copy next to the target first, then rename: the rename is atomic, so an app relaunching right now never starts a
  # half-written AppImage ($TMP is often another filesystem, where mv is a copy).
  cp "$TMP/$ASSET" "$APPIMAGE.new"
  mv -f "$APPIMAGE.new" "$APPIMAGE"
  info "Installed $APP_NAME ${TAG:-} to $APPIMAGE"

  # AppImages mount themselves with FUSE 2, which newer distributions no longer install by default.
  if ! ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    warn "libfuse2 was not found. If $APP_NAME does not start, install it (Debian/Ubuntu: sudo apt install libfuse2t64 or libfuse2)"
  fi

  if [ "${HARNESS_TEST_PORTAL_NO_SHORTCUT:-0}" != "1" ]; then
    DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
    APPS="$DATA/applications"
    ICONS="$DATA/icons/hicolor/256x256/apps"
    mkdir -p "$APPS" "$ICONS"
    # The app icon from the tagged sources (the AppImage keeps its own inside).
    ICON_REF="${TAG:+v$TAG}"
    download "https://raw.githubusercontent.com/$REPO/${ICON_REF:-main}/src-tauri/icons/128x128@2x.png" "$ICONS/$BIN.png" 2>/dev/null ||
      warn "couldn't download the app icon. The launcher uses a generic one"
    # StartupWMClass ties the window to this entry (the app id is the program name), so docks show the app's icon.
    cat >"$APPS/$BIN.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Practice tests for AI engineering topics
Exec="$APPIMAGE"
Icon=$BIN
Terminal=false
Categories=Education;Development;
StartupWMClass=$BIN
EOF
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
    # KDE reads launchers from its own cache: rebuild it, so the first window already has the icon.
    for TOOL in kbuildsycoca6 kbuildsycoca5; do
      command -v "$TOOL" >/dev/null 2>&1 && "$TOOL" >/dev/null 2>&1 || true
    done
    # Desktops cache icons by name: refresh an existing cache so a changed icon shows without logging out. Never
    # create one, since a cache nothing else keeps up to date would hide icons other apps add later.
    THEME="$(dirname "$(dirname "$ICONS")")"
    [ -f "$THEME/icon-theme.cache" ] && command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$THEME" >/dev/null 2>&1 || true
    info "Added \"$APP_NAME\" to your applications menu"
  fi
else
  need tar
  APPS_DIR="$HOME/Applications"
  APP="$APPS_DIR/$APP_NAME.app"
  mkdir -p "$APPS_DIR" "$TMP/app"
  tar -xzf "$TMP/$ASSET" -C "$TMP/app"
  BUNDLE="$(find "$TMP/app" -maxdepth 1 -name '*.app' | head -n 1)"
  [ -n "$BUNDLE" ] || fail "$ASSET holds no .app bundle"
  rm -rf "$APP"
  mv "$BUNDLE" "$APP"
  # The release is not notarized: clear the download quarantine, and give Apple Silicon the ad-hoc signature it
  # needs to run unsigned code.
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
  command -v codesign >/dev/null 2>&1 && codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
  info "Installed $APP_NAME ${TAG:-} to $APP"
fi

if [ "$OS" = "linux" ]; then
  printf '\nOpen \033[1m%s\033[0m from your applications menu, or run %s. The app updates itself.\n' "$APP_NAME" "$APPIMAGE"
else
  printf '\nOpen \033[1m%s\033[0m from Spotlight or Launchpad. The app updates itself.\n' "$APP_NAME"
fi
