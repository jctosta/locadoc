import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runDoctorWith,
  type DoctorDeps,
} from "../src/commands/doctor.ts";
import { openStore, upsertDocset } from "../src/store.ts";
import type { DoctorReport, GlobalFlags } from "../src/types.ts";
import type { ReleaseInfo } from "../src/github.ts";

let home: string;
let skillsRoot: string;

const quietJson: GlobalFlags = { json: true, text: false, quiet: true };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "locadoc-doctor-"));
  skillsRoot = mkdtempSync(join(tmpdir(), "locadoc-doctor-skills-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(skillsRoot, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    home,
    skillsRoot,
    fetchLatest: async () =>
      ({
        tag: "v0.1.0",
        version: "0.1.0",
        publishedAt: "2026-04-01T00:00:00Z",
        assets: [],
      }) as ReleaseInfo,
    execPath: "/some/bin/locadoc",
    pathEnv: "/some/bin:/usr/local/bin",
    currentVersion: "0.1.0",
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

async function runDoctorCapture(
  deps: DoctorDeps,
  args: { noNetwork?: boolean } = {},
): Promise<{ report: DoctorReport; code: number; stdout: string }> {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await runDoctorWith(deps, args, quietJson);
    const report = JSON.parse(out) as DoctorReport;
    return { report, code, stdout: out };
  } finally {
    process.stdout.write = orig;
  }
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((c) => c.name === name);
}

test("fresh home reports ok; manifest missing reports warn", async () => {
  const { report, code } = await runDoctorCapture(makeDeps(), {
    noNetwork: true,
  });
  expect(code).toBe(0);
  expect(findCheck(report, "home")?.status).toBe("ok");
  expect(findCheck(report, "manifest")?.status).toBe("warn");
  expect(findCheck(report, "manifest")?.detail).toContain("missing");
  expect(findCheck(report, "database")?.status).toBe("ok");
  expect(findCheck(report, "docsets")?.status).toBe("ok");
  expect(report.summary.fail).toBe(0);
});

test("fresh manifest reports ok", async () => {
  openStore(home);
  const manifestPath = join(home, "manifest.json");
  writeFileSync(manifestPath, "[]");
  const writtenAt = Date.now();
  const { report } = await runDoctorCapture(
    makeDeps({ now: () => writtenAt + 60_000 }),
    { noNetwork: true },
  );
  expect(findCheck(report, "manifest")?.status).toBe("ok");
  expect(findCheck(report, "manifest")?.detail).toContain("fresh");
});

test("stale manifest (>24h) reports warn", async () => {
  openStore(home);
  const manifestPath = join(home, "manifest.json");
  writeFileSync(manifestPath, "[]");
  const writtenAt = Date.now();
  const { report } = await runDoctorCapture(
    makeDeps({ now: () => writtenAt + 48 * 60 * 60 * 1000 }),
    { noNetwork: true },
  );
  expect(findCheck(report, "manifest")?.status).toBe("warn");
  expect(findCheck(report, "manifest")?.detail).toContain("stale");
});

test("home that cannot be created reports fail and exits CHECK", async () => {
  // Point home at a path whose parent is an existing file — mkdirSync fails.
  const blocker = join(home, "file-not-dir");
  writeFileSync(blocker, "x");
  const badHome = join(blocker, "child");
  const { report, code } = await runDoctorCapture(
    makeDeps({ home: badHome }),
    { noNetwork: true },
  );
  expect(findCheck(report, "home")?.status).toBe("fail");
  expect(code).toBe(5);
  expect(report.summary.fail).toBeGreaterThan(0);
});

test("docsets registry/disk mismatch reports warn", async () => {
  const store = openStore(home);
  upsertDocset(
    store,
    { slug: "ghost", name: "Ghost", mtime: 1 },
    [{ name: "x", path: "x", type: "T" }],
  );
  // registry has 'ghost' but no 'ghost/' dir on disk
  mkdirSync(join(home, "docsets", "orphan"), { recursive: true });

  const { report } = await runDoctorCapture(makeDeps(), { noNetwork: true });
  const docsets = findCheck(report, "docsets");
  expect(docsets?.status).toBe("warn");
  expect(docsets?.detail).toContain("ghost");
  expect(docsets?.detail).toContain("orphan");
});

test("binary check warns when dir not on PATH", async () => {
  const { report } = await runDoctorCapture(
    makeDeps({ execPath: "/nowhere/locadoc", pathEnv: "/usr/bin" }),
    { noNetwork: true },
  );
  const bin = findCheck(report, "binary");
  expect(bin?.status).toBe("warn");
  expect(bin?.detail).toContain("not on PATH");
});

test("binary check ok when dir is on PATH", async () => {
  const { report } = await runDoctorCapture(
    makeDeps({
      execPath: "/usr/local/bin/locadoc",
      pathEnv: "/usr/bin:/usr/local/bin",
    }),
    { noNetwork: true },
  );
  expect(findCheck(report, "binary")?.status).toBe("ok");
});

test("version check warns when behind latest", async () => {
  const { report } = await runDoctorCapture(
    makeDeps({
      currentVersion: "0.1.0",
      fetchLatest: async () =>
        ({
          tag: "v0.5.0",
          version: "0.5.0",
          publishedAt: "2026-04-01T00:00:00Z",
          assets: [],
        }) as ReleaseInfo,
    }),
  );
  const v = findCheck(report, "version");
  expect(v?.status).toBe("warn");
  expect(v?.detail).toContain("0.5.0");
});

test("version check warns (not fails) on network error", async () => {
  const { report, code } = await runDoctorCapture(
    makeDeps({
      fetchLatest: async () => {
        throw new Error("boom");
      },
    }),
  );
  expect(findCheck(report, "version")?.status).toBe("warn");
  // network error alone doesn't fail the whole doctor
  expect(code).toBe(0);
});

test("--no-network skips version check", async () => {
  const { report } = await runDoctorCapture(makeDeps(), { noNetwork: true });
  expect(findCheck(report, "version")).toBeUndefined();
});

test("global skill installed → ok; absent → warn", async () => {
  // Absent
  let { report } = await runDoctorCapture(makeDeps(), { noNetwork: true });
  expect(findCheck(report, "skill (global)")?.status).toBe("warn");

  // Installed
  mkdirSync(join(skillsRoot, "locadoc"), { recursive: true });
  writeFileSync(join(skillsRoot, "locadoc", "SKILL.md"), "---\n");
  ({ report } = await runDoctorCapture(makeDeps(), { noNetwork: true }));
  expect(findCheck(report, "skill (global)")?.status).toBe("ok");
});

test("project skill absent → ok (opt-in)", async () => {
  const { report } = await runDoctorCapture(makeDeps(), { noNetwork: true });
  expect(findCheck(report, "skill (project)")?.status).toBe("ok");
  expect(findCheck(report, "skill (project)")?.detail).toContain("optional");
});
