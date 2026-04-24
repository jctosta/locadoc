import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";
import { pickAssetName } from "../../src/github.ts";

let home: string;
let server: FixtureServer;

const assetForHost = pickAssetName(process.platform, process.arch);

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-self-update-e2e-"));
  server = await startFixtureServer({
    releaseVersion: "v9.9.9",
    releaseAssets: [assetForHost, "SHA256SUMS"],
  });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("self-update --check reports 'available' when newer release exists", async () => {
  const res = await runCli({
    args: ["self-update", "--check", "--json"],
    home,
    env: { LOCADOC_GITHUB_API_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const payload = JSON.parse(res.stdout);
  expect(payload.action).toBe("available");
  expect(payload.latestVersion).toBe("9.9.9");
});

test("self-update --dry-run shows what would be installed from source", async () => {
  const res = await runCli({
    args: ["self-update", "--dry-run", "--json"],
    home,
    env: { LOCADOC_GITHUB_API_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const payload = JSON.parse(res.stdout);
  expect(payload.action).toBe("dry-run");
  expect(payload.reason).toContain(assetForHost);
});

test("self-update run from source refuses actual installation", async () => {
  const res = await runCli({
    args: ["self-update", "--force", "--json"],
    home,
    env: { LOCADOC_GITHUB_API_BASE: server.baseUrl },
  });
  expect(res.code).toBe(2);
  const payload = JSON.parse(res.stdout);
  expect(payload.action).toBe("refused");
  expect(payload.reason).toContain("source");
});
