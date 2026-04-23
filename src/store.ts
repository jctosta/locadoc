import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import type { InstalledDocset, IndexEntry } from "./types.ts";

export interface Store {
  home: string;
  manifestPath: string;
  docsetsDir: string;
  db: Database;
  docsetDir(slug: string): string;
}

const DDL = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS docsets (
     slug TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     version TEXT,
     release TEXT,
     mtime INTEGER NOT NULL,
     installed_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS entries (
     docset TEXT NOT NULL,
     name TEXT NOT NULL,
     path TEXT NOT NULL,
     type TEXT NOT NULL,
     PRIMARY KEY (docset, path, name),
     FOREIGN KEY (docset) REFERENCES docsets(slug) ON DELETE CASCADE
   )`,
  "CREATE INDEX IF NOT EXISTS idx_entries_docset ON entries(docset)",
  "CREATE INDEX IF NOT EXISTS idx_entries_name ON entries(name)",
];

export function openStore(homeOverride?: string): Store {
  const home =
    homeOverride ?? process.env.LOCADOC_HOME ?? join(homedir(), ".locadoc");
  const docsetsDir = join(home, "docsets");
  const manifestPath = join(home, "manifest.json");
  const dbPath = join(home, "locadoc.db");

  mkdirSync(docsetsDir, { recursive: true });

  const db = new Database(dbPath);
  for (const stmt of DDL) db.run(stmt);

  return {
    home,
    manifestPath,
    docsetsDir,
    db,
    docsetDir: (slug: string) => join(docsetsDir, slug),
  };
}

export function listInstalled(store: Store): InstalledDocset[] {
  return store.db
    .query<
      {
        slug: string;
        name: string;
        version: string | null;
        release: string | null;
        mtime: number;
        installed_at: number;
      },
      []
    >(
      `SELECT slug, name, version, release, mtime, installed_at
       FROM docsets ORDER BY slug`,
    )
    .all()
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      version: r.version ?? undefined,
      release: r.release ?? undefined,
      mtime: r.mtime,
      installedAt: r.installed_at,
    }));
}

export function upsertDocset(
  store: Store,
  meta: {
    slug: string;
    name: string;
    version?: string;
    release?: string;
    mtime: number;
  },
  entries: IndexEntry[],
): void {
  const now = Math.floor(Date.now() / 1000);
  store.db.transaction(() => {
    store.db
      .prepare(
        `INSERT INTO docsets (slug, name, version, release, mtime, installed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           version = excluded.version,
           release = excluded.release,
           mtime = excluded.mtime,
           installed_at = excluded.installed_at`,
      )
      .run(
        meta.slug,
        meta.name,
        meta.version ?? null,
        meta.release ?? null,
        meta.mtime,
        now,
      );
    store.db.prepare("DELETE FROM entries WHERE docset = ?").run(meta.slug);
    const ins = store.db.prepare(
      "INSERT OR IGNORE INTO entries (docset, name, path, type) VALUES (?, ?, ?, ?)",
    );
    for (const e of entries) {
      ins.run(meta.slug, e.name, e.path, e.type);
    }
  })();
}

export function removeDocset(store: Store, slug: string): boolean {
  const row = store.db
    .prepare("SELECT 1 FROM docsets WHERE slug = ?")
    .get(slug);
  if (!row) return false;
  store.db.prepare("DELETE FROM docsets WHERE slug = ?").run(slug);
  const dir = store.docsetDir(slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return true;
}

export function loadAllEntries(
  store: Store,
): { docset: string; name: string; path: string; type: string }[] {
  return store.db
    .query<
      { docset: string; name: string; path: string; type: string },
      []
    >(`SELECT docset, name, path, type FROM entries`)
    .all();
}

export function loadDocsetEntries(
  store: Store,
  slug: string,
): { docset: string; name: string; path: string; type: string }[] {
  return store.db
    .query<
      { docset: string; name: string; path: string; type: string },
      [string]
    >(`SELECT docset, name, path, type FROM entries WHERE docset = ?`)
    .all(slug);
}

export function getInstalled(
  store: Store,
  slug: string,
): InstalledDocset | undefined {
  const r = store.db
    .query<
      {
        slug: string;
        name: string;
        version: string | null;
        release: string | null;
        mtime: number;
        installed_at: number;
      },
      [string]
    >(
      `SELECT slug, name, version, release, mtime, installed_at FROM docsets WHERE slug = ?`,
    )
    .get(slug);
  if (!r) return undefined;
  return {
    slug: r.slug,
    name: r.name,
    version: r.version ?? undefined,
    release: r.release ?? undefined,
    mtime: r.mtime,
    installedAt: r.installed_at,
  };
}
