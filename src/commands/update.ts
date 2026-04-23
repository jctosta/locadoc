import { fetchManifest, loadCachedManifest } from "../devdocs.ts";
import { ansi, log } from "../output.ts";
import { listInstalled, openStore } from "../store.ts";
import { EXIT, type GlobalFlags } from "../types.ts";
import { runDownload } from "./download.ts";

export interface UpdateArgs {
  slugs: string[];
}

export async function runUpdate(
  args: UpdateArgs,
  flags: GlobalFlags,
): Promise<number> {
  const store = openStore(flags.home);
  log(flags, "refreshing manifest…");
  const manifest =
    (await loadCachedManifest(store.manifestPath)) ??
    (await fetchManifest(store.manifestPath, true));

  const installed = listInstalled(store);
  if (installed.length === 0) {
    log(flags, "no docsets installed");
    return EXIT.OK;
  }

  const candidates = args.slugs.length > 0 ? args.slugs : installed.map((d) => d.slug);
  const stale = candidates.filter((slug) => {
    const local = installed.find((d) => d.slug === slug);
    const remote = manifest.find((m) => m.slug === slug);
    return local && remote && local.mtime < remote.mtime;
  });

  if (stale.length === 0) {
    log(flags, ansi.green("all up-to-date"));
    return EXIT.OK;
  }

  return await runDownload({ slugs: stale }, flags);
}
