import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-docs-e2e-"));
  server = await startFixtureServer();
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("docs fetches the manifest and reports count", async () => {
  const res = await runCli({
    args: ["docs", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const payload = JSON.parse(res.stdout);
  expect(payload.count).toBe(2);
  expect(payload.path).toContain(home);
});

test("docs --refresh bypasses the cache", async () => {
  const first = await runCli({
    args: ["docs", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(first.code).toBe(0);

  const refresh = await runCli({
    args: ["docs", "--refresh", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(refresh.code).toBe(0);
  const payload = JSON.parse(refresh.stdout);
  expect(payload.count).toBe(2);
});

test("docs exits 3 on server error", async () => {
  await server.close();
  const failing = await startFixtureServer({ failManifest: true });
  try {
    const res = await runCli({
      args: ["docs", "--json"],
      home,
      env: { LOCADOC_DEVDOCS_BASE: failing.baseUrl },
    });
    expect(res.code).toBe(3);
    expect(res.stderr).toContain("network");
  } finally {
    await failing.close();
    server = await startFixtureServer();
  }
});
