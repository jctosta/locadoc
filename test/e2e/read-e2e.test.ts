import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-read-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("read renders a page as markdown", async () => {
  await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({
    args: ["read", "mini", "hooks", "--json"],
    home,
  });
  expect(res.code).toBe(0);
  const payload = JSON.parse(res.stdout);
  expect(payload.docset).toBe("mini");
  expect(payload.markdown).toContain("useEffect");
});

test("read with missing path arg exits USAGE", async () => {
  const res = await runCli({
    args: ["read", "mini"],
    home,
  });
  expect(res.code).toBe(2);
});

test("read with unknown slug exits NOT_FOUND", async () => {
  const res = await runCli({
    args: ["read", "ghost", "page", "--json"],
    home,
  });
  expect(res.code).toBe(1);
});
