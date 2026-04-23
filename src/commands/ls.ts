import { loadCachedManifest, fetchManifest } from "../devdocs.ts";
import { ansi, emit, table } from "../output.ts";
import { listInstalled, openStore } from "../store.ts";
import type { GlobalFlags, LsRow, Manifest } from "../types.ts";

export interface LsArgs {
  all?: boolean;
  installed?: boolean;
}

export async function runLs(
  args: LsArgs,
  flags: GlobalFlags,
): Promise<number> {
  const store = openStore(flags.home);
  const installed = listInstalled(store);
  const installedMap = new Map(installed.map((d) => [d.slug, d]));

  let manifest: Manifest | undefined = await loadCachedManifest(
    store.manifestPath,
  );
  if (args.all && !manifest) {
    manifest = await fetchManifest(store.manifestPath);
  }

  const rows: LsRow[] = [];
  if (args.all) {
    for (const m of manifest ?? []) {
      const local = installedMap.get(m.slug);
      rows.push({
        slug: m.slug,
        name: m.name,
        version: m.version,
        release: m.release,
        mtime: m.mtime,
        installed: !!local,
        stale: !!local && local.mtime < m.mtime,
      });
    }
  } else {
    for (const d of installed) {
      const remote = manifest?.find((m) => m.slug === d.slug);
      rows.push({
        slug: d.slug,
        name: d.name,
        version: d.version,
        release: d.release,
        mtime: d.mtime,
        installed: true,
        stale: !!remote && d.mtime < remote.mtime,
      });
    }
  }

  emit(flags, rows, () => renderRows(rows, !!args.all));
  return 0;
}

function renderRows(rows: LsRow[], showAll: boolean): string {
  if (rows.length === 0) {
    return showAll
      ? "no docsets in manifest (run `locadoc docs` first)"
      : "no docsets installed (run `locadoc download <slug>`)";
  }
  const header = ["SLUG", "NAME", "VERSION", "STATUS"].map((h) => ansi.dim(h));
  const body = rows.map((r) => {
    const version = r.version ?? r.release ?? "";
    let status = "";
    if (showAll) {
      status = r.installed
        ? r.stale
          ? ansi.yellow("installed (stale)")
          : ansi.green("installed")
        : ansi.dim("available");
    } else {
      status = r.stale ? ansi.yellow("stale") : ansi.green("up-to-date");
    }
    return [r.slug, r.name, version, status];
  });
  return table([header, ...body]);
}
