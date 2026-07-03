#!/bin/sh
# backpack CLI installer.
#   curl -fsSL https://raw.githubusercontent.com/whitecommand-org/backpack/main/install.sh | sh
#
# Env overrides:
#   BACKPACK_VERSION=v0.1.1        install a specific tag (default: latest)
#   BACKPACK_INSTALL_DIR=~/.local/bin   install location (default: /usr/local/bin)
set -eu

REPO="whitecommand-org/backpack"
BIN="backpack"
VERSION="${BACKPACK_VERSION:-latest}"
INSTALL_DIR="${BACKPACK_INSTALL_DIR:-/usr/local/bin}"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }

# --- detect platform -> release asset name ---
os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *) err "unsupported OS '$os'. On Windows, download backpack-windows-x64.exe from the releases page." ;;
esac
case "$arch" in
  x86_64|amd64)  arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) err "unsupported architecture '$arch'." ;;
esac
asset="${BIN}-${os}-${arch}"

# --- pick a downloader ---
if command -v curl >/dev/null 2>&1; then
  dl() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  dl() { wget -qO "$2" "$1"; }
else
  err "need curl or wget to download."
fi

if [ "$VERSION" = latest ]; then
  base="https://github.com/${REPO}/releases/latest/download"
else
  base="https://github.com/${REPO}/releases/download/${VERSION}"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf 'Downloading %s (%s)...\n' "$asset" "$VERSION"
dl "${base}/${asset}" "${tmp}/${BIN}" || err "download failed: ${base}/${asset}"

# --- verify checksum when available ---
if dl "${base}/${asset}.sha256" "${tmp}/${asset}.sha256" 2>/dev/null; then
  want=$(awk '{print $1}' "${tmp}/${asset}.sha256")
  if command -v sha256sum >/dev/null 2>&1; then
    got=$(sha256sum "${tmp}/${BIN}" | awk '{print $1}')
  else
    got=$(shasum -a 256 "${tmp}/${BIN}" | awk '{print $1}')
  fi
  [ "$want" = "$got" ] || err "checksum mismatch (expected $want, got $got)"
  printf 'Checksum OK.\n'
fi

chmod +x "${tmp}/${BIN}"
# macOS Gatekeeper: clear the quarantine flag on the unsigned binary.
[ "$os" = darwin ] && xattr -d com.apple.quarantine "${tmp}/${BIN}" 2>/dev/null || true

# --- install (use sudo only if the target dir isn't writable) ---
mkdir -p "$INSTALL_DIR" 2>/dev/null || true
dest="${INSTALL_DIR}/${BIN}"
if [ -w "$INSTALL_DIR" ]; then
  mv "${tmp}/${BIN}" "$dest"
elif command -v sudo >/dev/null 2>&1; then
  printf 'Installing to %s (needs sudo)...\n' "$INSTALL_DIR"
  sudo mv "${tmp}/${BIN}" "$dest"
else
  err "cannot write to ${INSTALL_DIR}. Re-run with BACKPACK_INSTALL_DIR=\$HOME/.local/bin"
fi

printf '\nInstalled %s -> %s\n' "$BIN" "$dest"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) "$dest" --version ;;
  *) printf 'Note: %s is not on your PATH. Add it, e.g.:\n  export PATH="%s:$PATH"\n' "$INSTALL_DIR" "$INSTALL_DIR" ;;
esac
