# locadoc

CLI for [devdocs.io](https://devdocs.io) content — search and read development documentation from the terminal or from automated workflows (scripts, LLM tool-use loops, editor integrations).

Docsets are downloaded once, stored under `$LOCADOC_HOME`, and searched with the same scoring algorithm devdocs.io uses in-browser.

> **AI-assisted project.** This codebase was designed and implemented collaboratively with an AI coding agent (Claude Code). The initial research, architecture decisions, and full implementation were produced in a single session from the prompt below. Review the source before depending on it in production.
>
> **Original prompt:**
> > I want to create a cli powered version of devdocs.io, to allow searching and fetching development documents directly from the terminal or piped in automated workflows. We can use https://github.com/toiletbril/dedoc as reference, but I don't want to make a carbon copy of the codebase, the idea is to keep things simple and make the tool AI friendly. Look into devdocs repository as well if needed (https://github.com/freeCodeCamp/devdocs).

## Install

```sh
bun install
bun link            # exposes `locadoc` as a global command
```

Or run without linking:

```sh
bun run src/cli.ts <command>
```

## Getting started

```sh
locadoc docs                       # fetch the manifest of available docsets
locadoc ls --all | head            # browse what's available
locadoc download bun react         # install one or more docsets
locadoc ls                         # see what's installed
locadoc search useEffect           # search across all installed docsets
locadoc read react reference/react/useeffect
```

Page paths come from the `path` column of `search` output — don't guess them. They map directly to keys in the docset's `db.json`.

## Output modes

locadoc is TTY-aware. Pretty output goes to a terminal, JSON goes to a pipe:

```sh
locadoc search useEffect                    # human-friendly table
locadoc search useEffect | jq '.[0]'        # structured JSON
```

Force either explicitly:

```sh
locadoc search useEffect --json
locadoc ls --all --text
```

Set `NO_COLOR=1` to disable ANSI styling.

## Commands

### `locadoc docs [--refresh]`

Fetch the manifest of available docsets from `https://devdocs.io/docs.json`. Cached for 24h; use `--refresh` to force re-fetch.

### `locadoc ls [--all]`

Default: list installed docsets. `--all` lists everything in the manifest (requires `locadoc docs` first).

### `locadoc download <slug>...`

Install one or more docsets. Fetches `{slug}.tar.gz` from `downloads.devdocs.io` and falls back to the per-file JSON endpoints on `documents.devdocs.io` if the tarball is missing.

### `locadoc update [<slug>...]`

Re-download docsets whose `mtime` is older than the manifest. With no args, updates everything installed.

### `locadoc remove <slug>...`

Delete docsets from disk and the registry.

### `locadoc search [--docset <slug>] [--type <t>] [--limit N] <query>`

Search installed docsets. Scoring is a port of devdocs' `searcher.js`: exact substring first, then fuzzy regex for queries ≥ 3 chars. Without `--docset`, searches across every installed docset.

### `locadoc read <slug> <path>[#fragment] [--format md|ansi|html|raw]`

Render a docset page. Paths come from `search` output. Fragments slice the HTML to a heading and its siblings.

`--format` defaults:
- `ansi` when stdout is a TTY
- `md` when piped or `--json` is set
- `raw` returns the untouched HTML; `html` returns the stripped/sliced HTML

## JSON schemas

Stable shapes, safe to consume from scripts / LLM tool calls.

**`ls` / `ls --all`** — `LsRow[]`:
```ts
{ slug, name, version?, release?, mtime, installed, stale }
```

**`search`** — `SearchResult[]`:
```ts
{ docset, name, path, type, score }
```

**`read`** — `ReadResult`:
```ts
{ docset, path, fragment?, title, markdown, attribution? }
```

**`docs`** — `{ count, cachedAt, path }`

**`download` / `remove`** — per-slug status records.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Not found (docset, page, search results) |
| 2 | Usage error |
| 3 | Network error |
| 4 | Storage error |

## Storage

```
$LOCADOC_HOME (default: ~/.locadoc/)
├── manifest.json      # cached docs.json
├── docsets/<slug>/    # index.json, db.json, meta.json (+ html assets)
└── locadoc.db         # SQLite: installed docsets + flattened entries index
```

Set `LOCADOC_HOME` or pass `--home <path>` to relocate.

## AI / automation usage

locadoc is designed to be called from LLM tool loops and scripts.

```sh
# Find a page, then read it, all as JSON
locadoc search 'promise.all' --json --limit 1 \
  | jq -r '.[0] | "\(.docset) \(.path)"' \
  | xargs -n2 locadoc read --json \
  | jq -r '.markdown'
```

- `--json` / `--text` force the output format independent of TTY state.
- `--quiet` silences stderr progress.
- Schemas are stable — only additive changes within `0.x`.
- No prompts, no spinners when piped.

## License and attribution

locadoc is released under the [MIT License](./LICENSE), with one exception: `src/searcher.ts` is a TypeScript port of [devdocs.io](https://devdocs.io)'s `assets/javascripts/app/searcher.js` and remains under the Mozilla Public License 2.0 per MPL's file-level copyleft.

Documentation content fetched at runtime is © its respective upstream authors, aggregated by [devdocs.io](https://devdocs.io) under MPL 2.0. This project does not redistribute docset content; it downloads it on demand from the public devdocs CDN.

[dedoc](https://github.com/toiletbril/dedoc) (GPL-3.0) by toiletbril served as a reference for the command surface and storage model — no code was copied from it. locadoc is an independent Bun/TypeScript implementation with different design goals (TTY-aware JSON output, Markdown rendering, AI tool-use friendly schemas).

## Development

```sh
bun test                    # run the test suite
bunx tsc --noEmit           # typecheck
LOCADOC_HOME=/tmp/x bun run src/cli.ts docs
```
