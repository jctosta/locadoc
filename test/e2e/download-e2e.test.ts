import { test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-download-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("download mini installs the tarball", async () => {
  const res = await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const payload = JSON.parse(res.stdout);
  expect(Array.isArray(payload)).toBe(true);
  expect(payload[0].slug).toBe("mini");
  expect(existsSync(join(home, "docsets", "mini", "index.json"))).toBe(true);
  expect(existsSync(join(home, "docsets", "mini", "db.json"))).toBe(true);
});

test("download unknown slug exits NOT_FOUND", async () => {
  const res = await runCli({
    args: ["download", "does-not-exist", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(1);
});
