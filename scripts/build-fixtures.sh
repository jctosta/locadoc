#!/usr/bin/env bash
set -euo pipefail

# Regenerate e2e test fixtures that aren't human-edited.
#
# Currently:
#   test/fixtures/docsets/mini.tar.gz  — tarball of the mini docset, extracted
#                                        at the root (index.json, db.json,
#                                        meta.json) to match devdocs' layout.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/test/fixtures/docsets/mini"
OUT="$ROOT/test/fixtures/docsets/mini.tar.gz"

if [[ ! -d "$SRC" ]]; then
  echo "error: $SRC does not exist" >&2
  exit 1
fi

tar -czf "$OUT" -C "$SRC" index.json db.json meta.json
echo "wrote $OUT"
