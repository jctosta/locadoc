import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-search-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("search returns matching entries across installed docsets", async () => {
  await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({
    args: ["search", "useEffect", "--json"],
    home,
  });
  expect(res.code).toBe(0);
  const rows = JSON.parse(res.stdout);
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].name).toBe("useEffect");
  expect(rows[0].docset).toBe("mini");
});

test("search with no docsets installed exits NOT_FOUND", async () => {
  const res = await runCli({
    args: ["search", "anything", "--json"],
    home,
  });
  expect(res.code).toBe(1);
});
