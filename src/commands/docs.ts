import { fetchManifest } from "../devdocs.ts";
import { emit, log } from "../output.ts";
import { openStore } from "../store.ts";
import type { GlobalFlags } from "../types.ts";

export interface DocsArgs {
  refresh?: boolean;
}

export async function runDocs(
  args: DocsArgs,
  flags: GlobalFlags,
): Promise<number> {
  const store = openStore(flags.home);
  log(flags, args.refresh ? "refreshing manifest…" : "loading manifest…");
  const manifest = await fetchManifest(store.manifestPath, !!args.refresh);
  emit(
    flags,
    { count: manifest.length, cachedAt: Date.now(), path: store.manifestPath },
    () =>
      `manifest: ${manifest.length} docsets available (cached at ${store.manifestPath})`,
  );
  return 0;
}
