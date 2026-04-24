import { test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-remove-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("remove uninstalls an installed docset", async () => {
  await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({
    args: ["remove", "mini", "--json"],
    home,
  });
  expect(res.code).toBe(0);
  expect(existsSync(join(home, "docsets", "mini"))).toBe(false);
});

test("remove of absent docset exits NOT_FOUND", async () => {
  const res = await runCli({
    args: ["remove", "mini", "--json"],
    home,
  });
  expect(res.code).toBe(1);
});
