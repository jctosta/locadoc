---
name: locadoc
description: Use when the user needs to look up API reference material or official library documentation — e.g. "how does useEffect work", "signature of Array.prototype.reduce", "docs for Bun.serve", "what does numpy.concatenate return". locadoc is a CLI on PATH that searches the devdocs.io corpus offline and emits JSON suitable for tool-chaining. Prefer it over web search for anything that is, or could be, in devdocs.
allowed-tools: Bash(locadoc:*)
---

# locadoc

locadoc is a local, offline-first mirror of [devdocs.io](https://devdocs.io). Reach for it whenever the user asks about official API reference material for a library or language.

## When to use

Invoke for questions that map to a documented API:

- "how does `useEffect` work"
- "signature of `Array.prototype.reduce`"
- "what does `numpy.concatenate` return"
- "docs for `Bun.serve`", "show me the React router API"
- "which methods does `std::vec::Vec` have"

Do **not** invoke for:

- Vague "how do I build X" / architectural questions.
- Topics unlikely to be in devdocs (internal codebases, blog posts, niche libraries).
- Questions the user explicitly wants answered from web search.

If unsure whether a docset is indexed, run `locadoc ls --json` first and check.

## Commands to memorize

Three commands cover 95% of workflows. All emit JSON when piped (which you are, always).

```bash
locadoc ls --json                                  # list installed docsets
locadoc search --json --limit 5 <query>            # rank entries across installed docsets
locadoc search --json --docset <slug> <query>      # or scope to one docset
locadoc read --json <slug> <path>                  # render a page to Markdown
```

Search output shape (stable):

```json
[{ "docset": "react", "name": "useEffect", "path": "reference/react/useeffect", "type": "Hook", "score": 100 }]
```

`path` values are direct keys into the docset — pass them verbatim to `read`. They may contain a `#fragment` which slices the page to one section.

Read output shape (stable):

```json
{ "docset": "react", "path": "reference/react/useeffect", "fragment": null,
  "title": "useEffect", "markdown": "# useEffect\n\n...", "attribution": "..." }
```

Exit codes: `0` OK, `1` not found, `2` usage, `3` network, `4` storage.

## Tool-chain recipe

When the user asks a doc question, run two commands: one `search` to pick the best hit, one `read` to fetch it.

```bash
locadoc search --json --limit 1 'useEffect' \
  | jq -r '.[0] | "\(.docset) \(.path)"' \
  | xargs -n2 locadoc read --json \
  | jq -r '.markdown'
```

Then answer the user in your own words, quoting short snippets from the markdown and linking back to the `path`. Don't paste the entire page unless the user asks.

When multiple docsets are likely relevant, ask `search` without `--docset` — results come back labeled with their source so you can disambiguate (e.g. `react` vs. `react_native`).

## Failure modes and fallbacks

| Symptom | Meaning | Recovery |
|---|---|---|
| `locadoc search` returns `[]` exit 1 | No matches in installed docsets | Run `locadoc ls --json` to see what's installed; suggest `locadoc download <slug>` for the relevant docset. |
| `locadoc read` prints `path "..." not found` | Path doesn't exist in the docset | Re-run `search --docset <slug>` to get a valid `path`. Don't guess paths. |
| `locadoc docs` fails with exit 3 | Network error reaching devdocs CDN | Fall back to existing cached data (`ls` still works). Mention the error to the user. |
| Command not found | locadoc not installed | Tell the user to install it from https://github.com/jctosta/locadoc/releases; don't attempt to install it yourself. |

## Practical notes

- **Always pass `--json`.** Text output is for humans; you need structured data.
- **Paths come from `search`, not from guesses.** The slug is the folder name, the path is the `db.json` key.
- **Respect `--limit`.** Default is 50; set `--limit 1` or `--limit 5` for tool-use to keep context tight.
- **Slugs may include `~` for versions** (`python~3.12`, `node~22_lts`). `locadoc ls --json` shows available versions.
- **Fragment slicing works** — `read react 'reference/react/useeffect#parameters'` returns only that section.

## Attribution

Documentation content is © its upstream authors, aggregated by [devdocs.io](https://devdocs.io) under MPL 2.0. When you paste content, credit the source docset in your answer (e.g. "from the React docs").
