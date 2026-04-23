import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ansi, emit, useColor } from "../output.ts";
import { getInstalled, openStore } from "../store.ts";
import {
  htmlToMarkdown,
  markdownToAnsi,
  sliceByFragment,
} from "../render.ts";
import {
  EXIT,
  type DocsetDb,
  type DocsetMeta,
  type GlobalFlags,
  type ReadResult,
  type RenderFormat,
} from "../types.ts";

export interface ReadArgs {
  slug: string;
  path: string;
  format?: RenderFormat;
}

export async function runRead(
  args: ReadArgs,
  flags: GlobalFlags,
): Promise<number> {
  if (!args.slug || !args.path) {
    process.stderr.write(ansi.red("usage: locadoc read <slug> <path>\n"));
    return EXIT.USAGE;
  }

  const store = openStore(flags.home);
  const installed = getInstalled(store, args.slug);
  if (!installed) {
    process.stderr.write(
      ansi.red(
        `docset "${args.slug}" not installed (run \`locadoc download ${args.slug}\`)\n`,
      ),
    );
    return EXIT.NOT_FOUND;
  }

  const dir = store.docsetDir(args.slug);
  const dbPath = join(dir, "db.json");
  const metaPath = join(dir, "meta.json");
  if (!existsSync(dbPath)) {
    process.stderr.write(
      ansi.red(`db.json missing for "${args.slug}" — re-run download\n`),
    );
    return EXIT.STORAGE;
  }

  const [dbRaw, metaRaw] = await Promise.all([
    readFile(dbPath, "utf8"),
    readFile(metaPath, "utf8"),
  ]);
  const db = JSON.parse(dbRaw) as DocsetDb;
  const meta = JSON.parse(metaRaw) as DocsetMeta;

  const { pagePath, fragment } = splitPath(args.path);
  const html = db[pagePath];
  if (html === undefined) {
    process.stderr.write(
      ansi.red(
        `path "${pagePath}" not found in docset "${args.slug}"\n` +
          `try: locadoc search --docset ${args.slug} <query>\n`,
      ),
    );
    return EXIT.NOT_FOUND;
  }

  const format = resolveFormat(args.format, flags);

  if (format === "raw" || format === "html") {
    const title = pickTitle(html);
    const result: ReadResult = {
      docset: args.slug,
      path: pagePath,
      fragment,
      title,
      markdown: format === "raw" ? html : sliceByFragment(html, fragment).html,
      attribution: meta.attribution,
    };
    emit(flags, result, () => result.markdown);
    return EXIT.OK;
  }

  const sliced = sliceByFragment(html, fragment);
  const md = htmlToMarkdown(sliced.html);
  const withAttr = meta.attribution
    ? `${md}\n\n---\n_${meta.attribution.replace(/\n+/g, " ").trim()}_`
    : md;
  const rendered = format === "ansi" ? markdownToAnsi(withAttr) : withAttr;

  const result: ReadResult = {
    docset: args.slug,
    path: pagePath,
    fragment,
    title: sliced.title,
    markdown: withAttr,
    attribution: meta.attribution,
  };
  emit(flags, result, () => rendered);
  return EXIT.OK;
}

function splitPath(input: string): { pagePath: string; fragment?: string } {
  const hash = input.indexOf("#");
  if (hash < 0) return { pagePath: input };
  return {
    pagePath: input.slice(0, hash),
    fragment: input.slice(hash + 1) || undefined,
  };
}

function resolveFormat(
  explicit: RenderFormat | undefined,
  flags: GlobalFlags,
): RenderFormat {
  if (explicit) return explicit;
  if (flags.json) return "md";
  return useColor() ? "ansi" : "md";
}

function pickTitle(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return m[1]!.replace(/<[^>]+>/g, "").trim();
}
