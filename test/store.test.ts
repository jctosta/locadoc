import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openStore,
  listInstalled,
  upsertDocset,
  removeDocset,
  getInstalled,
  loadAllEntries,
  loadDocsetEntries,
} from "../src/store.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "locadoc-test-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

test("openStore creates dirs and tables", () => {
  const store = openStore(home);
  expect(listInstalled(store)).toEqual([]);
});

test("upsert then list roundtrips a docset", () => {
  const store = openStore(home);
  upsertDocset(
    store,
    { slug: "react", name: "React", version: "18", mtime: 42 },
    [
      { name: "useEffect", path: "hooks/use-effect", type: "Hook" },
      { name: "useState", path: "hooks/use-state", type: "Hook" },
    ],
  );
  const installed = listInstalled(store);
  expect(installed).toHaveLength(1);
  expect(installed[0]?.slug).toBe("react");
  expect(installed[0]?.mtime).toBe(42);
  const entries = loadAllEntries(store);
  expect(entries).toHaveLength(2);
  expect(loadDocsetEntries(store, "react")).toHaveLength(2);
});

test("upsert replaces existing entries", () => {
  const store = openStore(home);
  upsertDocset(store, { slug: "react", name: "React", mtime: 1 }, [
    { name: "a", path: "a", type: "T" },
    { name: "b", path: "b", type: "T" },
  ]);
  upsertDocset(store, { slug: "react", name: "React", mtime: 2 }, [
    { name: "c", path: "c", type: "T" },
  ]);
  expect(loadDocsetEntries(store, "react")).toHaveLength(1);
  expect(getInstalled(store, "react")?.mtime).toBe(2);
});

test("removeDocset deletes registry and entries", () => {
  const store = openStore(home);
  upsertDocset(store, { slug: "react", name: "React", mtime: 1 }, [
    { name: "a", path: "a", type: "T" },
  ]);
  expect(removeDocset(store, "react")).toBe(true);
  expect(listInstalled(store)).toEqual([]);
  expect(loadAllEntries(store)).toEqual([]);
  expect(removeDocset(store, "react")).toBe(false);
});
