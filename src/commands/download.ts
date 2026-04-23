import {
  downloadDocset,
  fetchManifest,
  findDocset,
  loadCachedManifest,
} from "../devdocs.ts";
import { ansi, emit, log } from "../output.ts";
import { getInstalled, openStore, upsertDocset } from "../store.ts";
import { EXIT, type GlobalFlags } from "../types.ts";

export interface DownloadArgs {
  slugs: string[];
  force?: boolean;
}

export async function runDownload(
  args: DownloadArgs,
  flags: GlobalFlags,
): Promise<number> {
  if (args.slugs.length === 0) {
    process.stderr.write(
      ansi.red("usage: locadoc download <slug>...\n"),
    );
    return EXIT.USAGE;
  }

  const store = openStore(flags.home);
  const manifest =
    (await loadCachedManifest(store.manifestPath)) ??
    (await fetchManifest(store.manifestPath));

  const results: {
    slug: string;
    status: "installed" | "skipped" | "not-found";
    mtime?: number;
    entries?: number;
  }[] = [];

  for (let i = 0; i < args.slugs.length; i++) {
    const slug = args.slugs[i]!;
    const m = findDocset(manifest, slug);
    if (!m) {
      log(flags, `[${i + 1}/${args.slugs.length}] ${slug}: not in manifest`);
      results.push({ slug, status: "not-found" });
      continue;
    }
    const existing = getInstalled(store, slug);
    if (existing && existing.mtime >= m.mtime && !args.force) {
      log(
        flags,
        `[${i + 1}/${args.slugs.length}] ${slug}: already up-to-date`,
      );
      results.push({ slug, status: "skipped", mtime: existing.mtime });
      continue;
    }
    log(flags, `[${i + 1}/${args.slugs.length}] ${slug}…`);
    const { meta, index } = await downloadDocset(
      slug,
      store.docsetDir(slug),
      (stage) => log(flags, `  ${stage}`),
    );
    upsertDocset(
      store,
      {
        slug: meta.slug,
        name: meta.name,
        version: meta.version,
        release: meta.release,
        mtime: meta.mtime,
      },
      index.entries,
    );
    results.push({
      slug,
      status: "installed",
      mtime: meta.mtime,
      entries: index.entries.length,
    });
  }

  emit(flags, results, () =>
    results
      .map((r) => {
        if (r.status === "not-found")
          return `${ansi.red("✗")} ${r.slug}: not in manifest`;
        if (r.status === "skipped")
          return `${ansi.dim("=")} ${r.slug}: up-to-date`;
        return `${ansi.green("✓")} ${r.slug}: ${r.entries} entries`;
      })
      .join("\n"),
  );

  const hasNotFound = results.some((r) => r.status === "not-found");
  return hasNotFound ? EXIT.NOT_FOUND : EXIT.OK;
}
