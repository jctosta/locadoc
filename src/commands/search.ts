import { ansi, emit, table } from "../output.ts";
import { loadAllEntries, loadDocsetEntries, openStore } from "../store.ts";
import { searchEntries } from "../searcher.ts";
import { EXIT, type GlobalFlags, type SearchResult } from "../types.ts";

export interface SearchArgs {
  query: string;
  docset?: string;
  type?: string;
  limit?: number;
}

export async function runSearch(
  args: SearchArgs,
  flags: GlobalFlags,
): Promise<number> {
  if (!args.query) {
    process.stderr.write(ansi.red("usage: locadoc search <query>\n"));
    return EXIT.USAGE;
  }

  const store = openStore(flags.home);
  const entries = args.docset
    ? loadDocsetEntries(store, args.docset)
    : loadAllEntries(store);

  if (entries.length === 0) {
    process.stderr.write(
      args.docset
        ? ansi.yellow(
            `no entries for docset "${args.docset}" — is it installed?\n`,
          )
        : ansi.yellow("no docsets installed — run `locadoc download <slug>`\n"),
    );
    emit(flags, [], () => "");
    return EXIT.NOT_FOUND;
  }

  const pool = args.type
    ? entries.filter((e) => e.type === args.type)
    : entries;

  const scored = searchEntries(pool, args.query, {
    maxResults: args.limit ?? 50,
  });

  const results: SearchResult[] = scored.map((s) => ({
    docset: s.item.docset,
    name: s.item.name,
    path: s.item.path,
    type: s.item.type,
    score: s.score,
  }));

  emit(flags, results, () => renderResults(results));
  return results.length === 0 ? EXIT.NOT_FOUND : EXIT.OK;
}

function renderResults(results: SearchResult[]): string {
  if (results.length === 0) return "no results";
  const rows = results.map((r) => [
    ansi.cyan(r.docset),
    r.name,
    ansi.dim(r.path),
    ansi.magenta(r.type),
    ansi.dim(`(${r.score})`),
  ]);
  return table(rows);
}
