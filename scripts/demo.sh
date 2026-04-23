#!/usr/bin/env bash
# Demo script for locadoc — consumed by `asciinema rec`.
# Uses a scratch LOCADOC_HOME so the recording is reproducible and doesn't
# touch the user's real ~/.locadoc.

set -e

DEMO_HOME=${DEMO_HOME:-/tmp/locadoc-asciinema-demo}
rm -rf "$DEMO_HOME"
export LOCADOC_HOME="$DEMO_HOME"

CYAN=$'\033[36m'
BOLD=$'\033[1m'
GRAY=$'\033[90m'
RESET=$'\033[0m'

PROMPT="${BOLD}${CYAN}❯${RESET} "
TYPE_DELAY=${TYPE_DELAY:-0.025}
CMD_PAUSE=${CMD_PAUSE:-1.0}
NOTE_PAUSE=${NOTE_PAUSE:-0.8}

type_cmd() {
  printf "%s" "$PROMPT"
  local i
  for (( i = 0; i < ${#1}; i++ )); do
    printf "%s" "${1:i:1}"
    sleep "$TYPE_DELAY"
  done
  printf "\n"
  sleep 0.4
}

run() {
  type_cmd "$1"
  eval "$1"
  sleep "$CMD_PAUSE"
}

note() {
  printf "\n${GRAY}# %s${RESET}\n" "$1"
  sleep "$NOTE_PAUSE"
}

clear

note "locadoc — search devdocs.io from the terminal or a tool chain"
run "locadoc --version"

note "Fetch the manifest of available docsets from devdocs.io"
run "locadoc docs"

note "Install the Bun docset"
run "locadoc download bun"

note "What's installed?"
run "locadoc ls"

note "Search — ranked results across every installed docset"
run "locadoc search Bun.serve"

note "Same call piped: structured JSON for tool chains / LLM agents"
run "locadoc search --limit 1 'Bun.serve' | jq"

note "Render a doc page (fragment slice keeps it short)"
run "locadoc read bun 'runtime/http/server#basic-setup'"

note "And it's a skill — \`locadoc skill install\` wires it into Claude Code"
run "locadoc skill where"

note "Done. Uninstall with \`locadoc remove <slug>\`"
run "locadoc remove bun"

printf "\n${PROMPT}${GRAY}# https://github.com/jctosta/locadoc${RESET}\n"
sleep 2
