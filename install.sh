#!/usr/bin/env bash
# locadoc installer — downloads the right prebuilt binary for macOS/Linux,
# verifies its SHA-256 against the release's SHA256SUMS, and drops it on PATH.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jctosta/locadoc/main/install.sh | bash
#
# Environment overrides:
#   PREFIX            install directory            (default: $HOME/.local/bin)
#   LOCADOC_VERSION   release tag to install       (default: latest)
#   LOCADOC_REPO      source repository            (default: jctosta/locadoc)

set -euo pipefail

REPO=${LOCADOC_REPO:-jctosta/locadoc}
VERSION=${LOCADOC_VERSION:-latest}
PREFIX=${PREFIX:-$HOME/.local/bin}

die()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }
info() { printf "\033[36m→\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$*"; }

command -v curl >/dev/null 2>&1 || die "curl is required"

# --- detect os ---------------------------------------------------------------
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux)  os=linux  ;;
  *) die "Unsupported OS: $(uname -s). Grab a binary from https://github.com/$REPO/releases" ;;
esac

# --- detect arch -------------------------------------------------------------
case "$(uname -m)" in
  x86_64|amd64)  arch=x64   ;;
  arm64|aarch64) arch=arm64 ;;
  *) die "Unsupported arch: $(uname -m). Grab a binary from https://github.com/$REPO/releases" ;;
esac

bin="locadoc-${os}-${arch}"

# --- pick sha-256 verifier ---------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  sha256_check() { sha256sum -c "$1" >/dev/null; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_check() { shasum -a 256 -c "$1" >/dev/null; }
else
  die "Need sha256sum or shasum to verify the download"
fi

# --- resolve release tag -----------------------------------------------------
if [[ "$VERSION" == "latest" ]]; then
  info "Resolving latest release of $REPO"
  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -n1)
  [[ -n "$tag" ]] || die "Could not resolve latest release tag from GitHub API"
else
  tag="$VERSION"
fi

url="https://github.com/$REPO/releases/download/$tag/$bin"
sums_url="https://github.com/$REPO/releases/download/$tag/SHA256SUMS"

# --- download ----------------------------------------------------------------
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

info "Downloading $bin ($tag)"
curl -fsSL "$url"      -o "$tmp/$bin"      || die "Failed to download $url"
curl -fsSL "$sums_url" -o "$tmp/SHA256SUMS" || die "Failed to download $sums_url"

# --- verify ------------------------------------------------------------------
info "Verifying SHA-256"
cd "$tmp"
grep "  $bin\$" SHA256SUMS > sha.expect \
  || die "No SHA-256 entry for $bin in SHA256SUMS"
sha256_check sha.expect || die "Checksum mismatch for $bin"
cd - >/dev/null

# --- install -----------------------------------------------------------------
mkdir -p "$PREFIX"
mv "$tmp/$bin" "$PREFIX/locadoc"
chmod +x "$PREFIX/locadoc"
ok "Installed: $PREFIX/locadoc ($tag)"

# --- PATH reminder -----------------------------------------------------------
case ":$PATH:" in
  *":$PREFIX:"*) ;;
  *)
    printf "\n\033[33m!\033[0m %s is not on your PATH.\n\n" "$PREFIX" >&2
    printf "  Add this to your shell rc (e.g. ~/.zshrc, ~/.bashrc):\n" >&2
    printf "    export PATH=\"%s:\$PATH\"\n\n" "$PREFIX" >&2
    ;;
esac

# --- confirm -----------------------------------------------------------------
"$PREFIX/locadoc" --version
