import { ansi, emit } from "../output.ts";
import { openStore, removeDocset } from "../store.ts";
import { EXIT, type GlobalFlags } from "../types.ts";

export interface RemoveArgs {
  slugs: string[];
}

export async function runRemove(
  args: RemoveArgs,
  flags: GlobalFlags,
): Promise<number> {
  if (args.slugs.length === 0) {
    process.stderr.write(ansi.red("usage: locadoc remove <slug>...\n"));
    return EXIT.USAGE;
  }
  const store = openStore(flags.home);
  const results = args.slugs.map((slug) => ({
    slug,
    removed: removeDocset(store, slug),
  }));
  emit(flags, results, () =>
    results
      .map((r) =>
        r.removed
          ? `${ansi.green("✓")} ${r.slug} removed`
          : `${ansi.dim("=")} ${r.slug}: not installed`,
      )
      .join("\n"),
  );
  return results.every((r) => r.removed) ? EXIT.OK : EXIT.NOT_FOUND;
}
