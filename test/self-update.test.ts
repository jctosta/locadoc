import { test, expect } from "bun:test";
import type { ReleaseInfo, FetchFn } from "../src/github.ts";
import {
  runSelfUpdateWith,
  type SelfUpdateDeps,
} from "../src/commands/self-update.ts";
import type { GlobalFlags } from "../src/types.ts";

const quietJson: GlobalFlags = { json: true, text: false, quiet: true };

function makeRelease(
  tag: string,
  assetNames: string[] = ["locadoc-linux-x64", "SHA256SUMS"],
): ReleaseInfo {
  return {
    tag,
    version: tag.replace(/^v/, ""),
    publishedAt: "2026-04-01T00:00:00Z",
    assets: assetNames.map((name) => ({
      name,
      url: `https://example/${name}`,
      size: 1,
    })),
  };
}

function makeDeps(overrides: Partial<SelfUpdateDeps> = {}): SelfUpdateDeps {
  return {
    fetchLatest: async () => makeRelease("v0.2.0"),
    fetchImpl: (async () => new Response("", { status: 200 })) as FetchFn,
    execPath: "/fake/locadoc",
    argv1: "/fake/locadoc",
    platform: "linux",
    arch: "x64",
    currentVersion: "0.1.0",
    ...overrides,
  };
}

function captureStdout<T>(fn: () => Promise<T>): Promise<{ out: string; value: T }> {
  return new Promise(async (resolve) => {
    const orig = process.stdout.write.bind(process.stdout);
    let out = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      const value = await fn();
      resolve({ out, value });
    } finally {
      process.stdout.write = orig;
    }
  });
}

test("--check reports 'available' when behind latest", async () => {
  const deps = makeDeps();
  const { out, value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { check: true }, quietJson),
  );
  expect(value).toBe(0);
  const payload = JSON.parse(out);
  expect(payload.action).toBe("available");
  expect(payload.currentVersion).toBe("0.1.0");
  expect(payload.latestVersion).toBe("0.2.0");
});

test("--check reports 'no-op' when up to date", async () => {
  const deps = makeDeps({
    fetchLatest: async () => makeRelease("v0.1.0"),
  });
  const { out, value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { check: true }, quietJson),
  );
  expect(value).toBe(0);
  const payload = JSON.parse(out);
  expect(payload.action).toBe("no-op");
});

test("no-op when already at latest and not --force", async () => {
  const deps = makeDeps({
    fetchLatest: async () => makeRelease("v0.1.0"),
  });
  const { value } = await captureStdout(() =>
    runSelfUpdateWith(deps, {}, quietJson),
  );
  expect(value).toBe(0);
});

test("--dry-run prints action without touching disk", async () => {
  const deps = makeDeps();
  const { out, value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { dryRun: true }, quietJson),
  );
  expect(value).toBe(0);
  const payload = JSON.parse(out);
  expect(payload.action).toBe("dry-run");
  expect(payload.path).toBe("/fake/locadoc");
  expect(payload.reason).toContain("locadoc-linux-x64");
});

test("refuses to run install from the bun runtime", async () => {
  const deps = makeDeps({
    execPath: "/usr/local/bin/bun",
    argv1: "/path/to/src/cli.ts",
  });
  const { out, value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { force: true }, quietJson),
  );
  expect(value).toBe(2);
  const payload = JSON.parse(out);
  expect(payload.action).toBe("refused");
  expect(payload.reason).toContain("source");
});

test("refuses to run install from src/cli.ts", async () => {
  const deps = makeDeps({
    execPath: "/usr/local/bin/bun",
    argv1: "/repo/src/cli.ts",
  });
  const { value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { force: true }, quietJson),
  );
  expect(value).toBe(2);
});

test("allows --check from source", async () => {
  const deps = makeDeps({
    execPath: "/usr/local/bin/bun",
    argv1: "/repo/src/cli.ts",
  });
  const { out, value } = await captureStdout(() =>
    runSelfUpdateWith(deps, { check: true }, quietJson),
  );
  expect(value).toBe(0);
  const payload = JSON.parse(out);
  expect(payload.action).toBe("available");
});

test("errors when platform asset missing", async () => {
  const deps = makeDeps({
    fetchLatest: async () => makeRelease("v0.2.0", ["SHA256SUMS"]),
  });
  let caught: unknown;
  try {
    await runSelfUpdateWith(deps, { force: true }, quietJson);
  } catch (err) {
    caught = err;
  }
  expect(String(caught)).toMatch(/no release asset/);
});

test("errors when SHA256SUMS missing", async () => {
  const deps = makeDeps({
    fetchLatest: async () =>
      makeRelease("v0.2.0", ["locadoc-linux-x64"]),
  });
  let caught: unknown;
  try {
    await runSelfUpdateWith(deps, { force: true }, quietJson);
  } catch (err) {
    caught = err;
  }
  expect(String(caught)).toMatch(/SHA256SUMS/);
});
