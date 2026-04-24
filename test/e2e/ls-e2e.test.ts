import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";
import { startFixtureServer, type FixtureServer } from "./helpers/server.ts";

let home: string;
let server: FixtureServer;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "locadoc-ls-e2e-"));
  server = await startFixtureServer({ tarballSlugs: ["mini"] });
});

afterEach(async () => {
  await server.close();
  rmSync(home, { recursive: true, force: true });
});

test("ls on empty home returns []", async () => {
  const res = await runCli({ args: ["ls", "--json"], home });
  expect(res.code).toBe(0);
  expect(JSON.parse(res.stdout)).toEqual([]);
});

test("ls after download shows the installed docset", async () => {
  await runCli({
    args: ["download", "mini", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({ args: ["ls", "--json"], home });
  expect(res.code).toBe(0);
  const rows = JSON.parse(res.stdout);
  expect(rows).toHaveLength(1);
  expect(rows[0].slug).toBe("mini");
  expect(rows[0].installed).toBe(true);
});

test("ls --all after docs lists manifest entries", async () => {
  await runCli({
    args: ["docs", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  const res = await runCli({
    args: ["ls", "--all", "--json"],
    home,
    env: { LOCADOC_DEVDOCS_BASE: server.baseUrl },
  });
  expect(res.code).toBe(0);
  const rows = JSON.parse(res.stdout);
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.some((r: { slug: string }) => r.slug === "mini")).toBe(true);
});
