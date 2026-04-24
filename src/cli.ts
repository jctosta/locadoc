#!/usr/bin/env bun
import { runDocs } from "./commands/docs.ts";
import { runDownload } from "./commands/download.ts";
import { runLs } from "./commands/ls.ts";
import { runRead } from "./commands/read.ts";
import { runRemove } from "./commands/remove.ts";
import { runSearch } from "./commands/search.ts";
import { runSelfUpdate } from "./commands/self-update.ts";
import { runSkill } from "./commands/skill.ts";
import { runUpdate } from "./commands/update.ts";
import type { RenderFormat, SkillScope } from "./types.ts";
import { ansi } from "./output.ts";
import { EXIT, type GlobalFlags } from "./types.ts";
import { NetworkError } from "./devdocs.ts";
import { VERSION } from "./version.ts";

const HELP = `locadoc — CLI for devdocs.io content

USAGE
  locadoc <command> [options]

COMMANDS
  docs [--refresh]                 Fetch/refresh the manifest of available docsets
  ls   [--all]                     List installed docsets (--all: everything in the manifest)
  download <slug>...               Install one or more docsets
  update   [<slug>...]             Re-download stale docsets (all if none given)
  remove   <slug>...               Uninstall docsets
  search   [--docset <s>] [--type <t>] [--limit N] <query>
                                   Search installed docsets
  read     <slug> <path>[#fragment] [--format md|ansi|html|raw]
                                   Render a documentation page
  skill    install|uninstall|where|show [--global|--project] [--force] [--dry-run]
                                   Manage the locadoc Claude Code skill
  self-update [--check|--force|--dry-run]
                                   Upgrade the locadoc binary from the latest release

GLOBAL FLAGS
  --json               Force JSON output
  --text               Force text output
  --quiet              Suppress progress on stderr
  --home <path>        Override $LOCADOC_HOME
  --help, -h           Show help
  --version, -v        Show version

Output defaults to text on a TTY and JSON when piped.
`;

type Parsed = {
  command?: string;
  positional: string[];
  options: Record<string, string | boolean>;
};

function parse(argv: string[]): Parsed {
  const out: Parsed = { positional: [], options: {} };
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok === "--") {
      out.positional.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        out.options[tok.slice(2, eq)] = tok.slice(eq + 1);
        i++;
        continue;
      }
      const name = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-") && needsValue(name)) {
        out.options[name] = next;
        i += 2;
      } else {
        out.options[name] = true;
        i++;
      }
      continue;
    }
    if (tok.startsWith("-") && tok.length > 1) {
      const short = tok.slice(1);
      out.options[short] = true;
      i++;
      continue;
    }
    if (!out.command) {
      out.command = tok;
    } else {
      out.positional.push(tok);
    }
    i++;
  }
  return out;
}

function needsValue(name: string): boolean {
  return [
    "home",
    "docset",
    "type",
    "limit",
    "format",
    "skills-root",
  ].includes(name);
}

function globalFlags(p: Parsed): GlobalFlags {
  return {
    json: !!p.options["json"],
    text: !!p.options["text"],
    quiet: !!p.options["quiet"],
    home: typeof p.options["home"] === "string" ? p.options["home"] : undefined,
  };
}

async function main(argv: string[]): Promise<number> {
  const p = parse(argv);

  if (p.options["version"] || p.options["v"]) {
    process.stdout.write(`locadoc ${VERSION}\n`);
    process.stdout.write(
      "docset content © devdocs.io contributors, MPL 2.0\n",
    );
    return EXIT.OK;
  }
  const helpRequested = !!p.options["help"] || !!p.options["h"];
  if (!p.command) {
    process.stdout.write(HELP);
    return helpRequested ? EXIT.OK : EXIT.USAGE;
  }
  if (helpRequested && p.command !== "skill") {
    process.stdout.write(HELP);
    return EXIT.OK;
  }

  const flags = globalFlags(p);

  try {
    switch (p.command) {
      case "docs":
        return await runDocs({ refresh: !!p.options["refresh"] }, flags);
      case "ls":
        return await runLs(
          { all: !!p.options["all"], installed: !!p.options["installed"] },
          flags,
        );
      case "download":
        return await runDownload(
          { slugs: p.positional, force: !!p.options["force"] },
          flags,
        );
      case "update":
        return await runUpdate({ slugs: p.positional }, flags);
      case "remove":
        return await runRemove({ slugs: p.positional }, flags);
      case "search": {
        const limit = p.options["limit"];
        return await runSearch(
          {
            query: p.positional.join(" "),
            docset:
              typeof p.options["docset"] === "string"
                ? p.options["docset"]
                : undefined,
            type:
              typeof p.options["type"] === "string"
                ? p.options["type"]
                : undefined,
            limit: typeof limit === "string" ? Number(limit) : undefined,
          },
          flags,
        );
      }
      case "skill": {
        const scopeFromFlags: SkillScope | undefined = p.options["project"]
          ? "project"
          : p.options["global"]
            ? "global"
            : undefined;
        return await runSkill(
          {
            verb: p.positional[0],
            scope: scopeFromFlags,
            force: !!p.options["force"],
            dryRun: !!p.options["dry-run"],
            skillsRoot:
              typeof p.options["skills-root"] === "string"
                ? p.options["skills-root"]
                : undefined,
          },
          flags,
        );
      }
      case "self-update":
        return await runSelfUpdate(
          {
            check: !!p.options["check"],
            force: !!p.options["force"],
            dryRun: !!p.options["dry-run"],
          },
          flags,
        );
      case "read": {
        const [slug, path] = p.positional;
        if (!slug || !path) {
          process.stderr.write(
            ansi.red("usage: locadoc read <slug> <path>[#fragment]\n"),
          );
          return EXIT.USAGE;
        }
        const fmtOpt =
          typeof p.options["format"] === "string"
            ? (p.options["format"] as RenderFormat)
            : undefined;
        if (
          fmtOpt &&
          !["md", "ansi", "html", "raw"].includes(fmtOpt)
        ) {
          process.stderr.write(
            ansi.red(
              `unknown --format "${fmtOpt}" (expected md|ansi|html|raw)\n`,
            ),
          );
          return EXIT.USAGE;
        }
        return await runRead({ slug, path, format: fmtOpt }, flags);
      }
      default:
        process.stderr.write(
          ansi.red(`unknown command: ${p.command}\n\n`) + HELP,
        );
        return EXIT.USAGE;
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      process.stderr.write(ansi.red(`network: ${err.message}\n`));
      return EXIT.NETWORK;
    }
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(ansi.red(`error: ${msg}\n`));
    return EXIT.STORAGE;
  }
}

const code = await main(process.argv.slice(2));
process.exit(code);
