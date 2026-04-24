import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-update-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("update with no installed docsets is a no-op (exit 0)", async () => {
  const res = await runCli({
    args: ["update", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
});

test("update re-syncs an installed docset", async () => {
  await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({
    args: ["update", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
});
