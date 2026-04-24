import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";
import { pickAssetName } from "../../src/github.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-doctor-e2e-"));
  server = await startFixtureServer({
    releaseVersion: "v0.1.0",
    releaseAssets: [pickAssetName(process.platform, process.arch), "SHA256SUMS"],
  });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("doctor --json --no-network passes on a fresh home", async () => {
  const res = await runCli({
    args: ["doctor", "--json", "--no-network"],
    home,
  });
  expect(res.code).toBe(0);
  const report = JSON.parse(res.stdout);
  expect(report.summary.fail).toBe(0);
  const home_check = report.checks.find(
    (c: { name: string }) => c.name === "home",
  );
  expect(home_check.status).toBe("ok");
});

test("doctor --json (with network) runs the version check", async () => {
  const res = await runCli({
    args: ["doctor", "--json"],
    home,
    env: { LOCADOC_GITHUB_API_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const report = JSON.parse(res.stdout);
  const v = report.checks.find(
    (c: { name: string }) => c.name === "version",
  );
  expect(v).toBeDefined();
  expect(v.status).toBe("ok");
});
