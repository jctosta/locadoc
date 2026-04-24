import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fetchLatestRelease, type ReleaseInfo } from "../github.ts";
import { ansi, emit, pickFormat } from "../output.ts";
import { listInstalled, openStore, type Store } from "../store.ts";
import {
  EXIT,
  type DoctorCheck,
  type DoctorReport,
  type DoctorStatus,
  type GlobalFlags,
} from "../types.ts";
import { compareSemver, VERSION } from "../version.ts";
import { resolveSkillTarget } from "./skill.ts";

export interface DoctorArgs {
  noNetwork?: boolean;
}

export interface DoctorDeps {
  home?: string;
  fetchLatest: () => Promise<ReleaseInfo>;
  execPath: string;
  pathEnv?: string;
  skillsRoot?: string;
  currentVersion: string;
  now: () => number;
}

const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;

export async function runDoctor(
  args: DoctorArgs,
  flags: GlobalFlags,
): Promise<number> {
  return runDoctorWith(
    {
      home: flags.home,
      fetchLatest: fetchLatestRelease,
      execPath: process.execPath,
      pathEnv: process.env.PATH,
      currentVersion: VERSION,
      now: () => Date.now(),
    },
    args,
    flags,
  );
}

export async function runDoctorWith(
  deps: DoctorDeps,
  args: DoctorArgs,
  flags: GlobalFlags,
): Promise<number> {
  const checks: DoctorCheck[] = [];

  let store: Store | null = null;
  try {
    store = openStore(deps.home);
    const probe = join(store.home, `.locadoc-doctor-${process.pid}`);
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    checks.push({ name: "home", status: "ok", detail: store.home });
  } catch (err) {
    checks.push({
      name: "home",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  checks.push(manifestCheck(store, deps.now));
  checks.push(databaseCheck(store));
  checks.push(docsetsCheck(store));
  checks.push(binaryCheck(deps.execPath, deps.pathEnv));

  if (!args.noNetwork) {
    checks.push(await versionCheck(deps));
  }

  checks.push(skillCheck("global", deps.skillsRoot));
  checks.push(skillCheck("project", deps.skillsRoot));

  const summary = {
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };
  const report: DoctorReport = { checks, summary };

  emit(flags, report, () => renderReport(report));
  return summary.fail > 0 ? EXIT.CHECK : EXIT.OK;
}

function manifestCheck(store: Store | null, now: () => number): DoctorCheck {
  if (!store) {
    return {
      name: "manifest",
      status: "warn",
      detail: "skipped — home unavailable",
    };
  }
  if (!existsSync(store.manifestPath)) {
    return {
      name: "manifest",
      status: "warn",
      detail: "missing; run `locadoc docs`",
    };
  }
  const age = now() - statSync(store.manifestPath).mtimeMs;
  const ageH = Math.round(age / (60 * 60 * 1000));
  if (age > MANIFEST_TTL_MS) {
    return {
      name: "manifest",
      status: "warn",
      detail: `stale (${ageH}h old); run \`locadoc docs --refresh\``,
    };
  }
  return { name: "manifest", status: "ok", detail: `fresh (${ageH}h old)` };
}

function databaseCheck(store: Store | null): DoctorCheck {
  if (!store) {
    return {
      name: "database",
      status: "warn",
      detail: "skipped — home unavailable",
    };
  }
  try {
    const row = store.db
      .query<{ integrity_check: string }, []>(`PRAGMA integrity_check`)
      .get();
    if (row?.integrity_check === "ok") {
      return { name: "database", status: "ok", detail: "integrity ok" };
    }
    return {
      name: "database",
      status: "fail",
      detail: `integrity_check returned: ${row?.integrity_check ?? "null"}`,
    };
  } catch (err) {
    return {
      name: "database",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function docsetsCheck(store: Store | null): DoctorCheck {
  if (!store) {
    return {
      name: "docsets",
      status: "warn",
      detail: "skipped — home unavailable",
    };
  }
  const registry = new Set(listInstalled(store).map((d) => d.slug));
  const onDisk = new Set<string>();
  if (existsSync(store.docsetsDir)) {
    for (const entry of readdirSync(store.docsetsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) onDisk.add(entry.name);
    }
  }
  const missingFromDisk = [...registry].filter((s) => !onDisk.has(s));
  const orphanedOnDisk = [...onDisk].filter((s) => !registry.has(s));
  if (missingFromDisk.length === 0 && orphanedOnDisk.length === 0) {
    return {
      name: "docsets",
      status: "ok",
      detail: `${registry.size} installed, ${onDisk.size} on disk`,
    };
  }
  const parts: string[] = [];
  if (missingFromDisk.length > 0) {
    parts.push(`missing on disk: ${missingFromDisk.join(", ")}`);
  }
  if (orphanedOnDisk.length > 0) {
    parts.push(`orphaned dirs: ${orphanedOnDisk.join(", ")}`);
  }
  return {
    name: "docsets",
    status: "warn",
    detail: `registry ${registry.size}, disk ${onDisk.size} (${parts.join("; ")})`,
  };
}

function binaryCheck(execPath: string, pathEnv?: string): DoctorCheck {
  const dir = dirname(execPath);
  const entries = (pathEnv ?? "").split(delimiter).filter(Boolean);
  const onPath = entries.some((p) => p === dir);
  if (onPath) {
    return { name: "binary", status: "ok", detail: execPath };
  }
  return {
    name: "binary",
    status: "warn",
    detail: `${execPath} — ${dir} not on PATH`,
  };
}

async function versionCheck(deps: DoctorDeps): Promise<DoctorCheck> {
  try {
    const latest = await deps.fetchLatest();
    const cmp = compareSemver(deps.currentVersion, latest.version);
    if (cmp >= 0) {
      return {
        name: "version",
        status: "ok",
        detail: `at latest (${deps.currentVersion})`,
      };
    }
    return {
      name: "version",
      status: "warn",
      detail: `current ${deps.currentVersion}, latest ${latest.version}; run \`locadoc self-update\``,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "version",
      status: "warn",
      detail: `could not check latest release (${msg})`,
    };
  }
}

function skillCheck(
  scope: "global" | "project",
  skillsRoot?: string,
): DoctorCheck {
  const target = resolveSkillTarget({ scope, skillsRoot });
  if (target.exists) {
    return {
      name: `skill (${scope})`,
      status: "ok",
      detail: `installed at ${target.path}`,
    };
  }
  if (scope === "global") {
    return {
      name: `skill (${scope})`,
      status: "warn",
      detail: `not installed; run \`locadoc skill install\``,
    };
  }
  return {
    name: `skill (${scope})`,
    status: "ok",
    detail: `not installed (project scope is optional)`,
  };
}

function renderReport(report: DoctorReport): string {
  const useColor = pickFormat({ json: false, text: true, quiet: false }) === "text";
  const statusCol = (s: DoctorStatus): string => {
    if (!useColor) return s;
    if (s === "ok") return ansi.green(s);
    if (s === "warn") return ansi.yellow(s);
    return ansi.red(s);
  };

  const header = ["STATUS", "CHECK", "DETAIL"];
  const rows = [header].concat(
    report.checks.map((c) => [statusCol(c.status), c.name, c.detail]),
  );

  const widthOf = (i: number) =>
    Math.max(...rows.map((r) => stripAnsi(r[i] ?? "").length));
  const widths = [widthOf(0), widthOf(1)];

  const body = rows
    .map((r) => {
      const cells = r.map((cell, i) => {
        if (i === r.length - 1) return cell;
        const visible = stripAnsi(cell);
        const pad = " ".repeat((widths[i] ?? 0) - visible.length);
        return cell + pad;
      });
      return cells.join("  ");
    })
    .join("\n");

  const { ok, warn, fail } = report.summary;
  const summary = `\n${ansi.dim(`summary: ${ok} ok, ${warn} warn, ${fail} fail`)}`;
  return body + summary;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
