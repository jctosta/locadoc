import {
  chmod,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { NetworkError } from "../devdocs.ts";
import {
  fetchLatestRelease,
  pickAssetName,
  type FetchFn,
  type ReleaseInfo,
} from "../github.ts";
import { ansi, emit, log } from "../output.ts";
import {
  EXIT,
  type GlobalFlags,
  type SelfUpdateResult,
} from "../types.ts";
import { compareSemver, VERSION } from "../version.ts";

export interface SelfUpdateArgs {
  check?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface SelfUpdateDeps {
  fetchLatest: () => Promise<ReleaseInfo>;
  fetchImpl: FetchFn;
  execPath: string;
  argv1?: string;
  platform: NodeJS.Platform;
  arch: string;
  currentVersion: string;
}

export async function runSelfUpdate(
  args: SelfUpdateArgs,
  flags: GlobalFlags,
): Promise<number> {
  return runSelfUpdateWith(
    {
      fetchLatest: fetchLatestRelease,
      fetchImpl: fetch,
      execPath: process.execPath,
      argv1: process.argv[1],
      platform: process.platform,
      arch: process.arch,
      currentVersion: VERSION,
    },
    args,
    flags,
  );
}

export async function runSelfUpdateWith(
  deps: SelfUpdateDeps,
  args: SelfUpdateArgs,
  flags: GlobalFlags,
): Promise<number> {
  const runningFromSource = isRunningFromSource(deps.execPath, deps.argv1);

  const latest = await deps.fetchLatest();
  const cmp = compareSemver(deps.currentVersion, latest.version);

  if (args.check) {
    const action: SelfUpdateResult["action"] =
      cmp < 0 ? "available" : "no-op";
    const result: SelfUpdateResult = {
      currentVersion: deps.currentVersion,
      latestVersion: latest.version,
      action,
    };
    emit(flags, result, () =>
      action === "available"
        ? `${ansi.yellow("→")} update available: ${deps.currentVersion} → ${latest.version}\n` +
          `run ${ansi.cyan("locadoc self-update")} to install`
        : `${ansi.green("✓")} up to date (${deps.currentVersion})`,
    );
    return EXIT.OK;
  }

  if (cmp >= 0 && !args.force) {
    const result: SelfUpdateResult = {
      currentVersion: deps.currentVersion,
      latestVersion: latest.version,
      action: "no-op",
    };
    emit(flags, result, () =>
      `${ansi.green("✓")} already at latest (${deps.currentVersion})`,
    );
    return EXIT.OK;
  }

  const assetName = pickAssetName(deps.platform, deps.arch);
  const asset = latest.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new NetworkError(
      `no release asset matches this platform: expected "${assetName}" in ${latest.tag}`,
    );
  }
  const sumsAsset = latest.assets.find((a) => a.name === "SHA256SUMS");
  if (!sumsAsset) {
    throw new NetworkError(`release ${latest.tag} is missing SHA256SUMS`);
  }

  if (args.dryRun) {
    const result: SelfUpdateResult = {
      currentVersion: deps.currentVersion,
      latestVersion: latest.version,
      action: "dry-run",
      path: deps.execPath,
      reason: `would download ${assetName} and replace ${deps.execPath}`,
    };
    emit(flags, result, () =>
      `${ansi.dim("dry-run:")} would download ${ansi.cyan(assetName)} and replace ${deps.execPath}`,
    );
    return EXIT.OK;
  }

  if (runningFromSource) {
    const result: SelfUpdateResult = {
      currentVersion: deps.currentVersion,
      latestVersion: latest.version,
      action: "refused",
      reason:
        "running from source; use `git pull && bun install` instead of self-update",
    };
    emit(flags, result, () =>
      `${ansi.yellow("refused:")} running from source (${deps.execPath})\n` +
      `update by running ${ansi.cyan("git pull && bun install")} in the locadoc checkout`,
    );
    return EXIT.USAGE;
  }

  log(flags, `downloading ${assetName}…`);
  const tempDir = await mkdtemp(join(tmpdir(), "locadoc-update-"));
  const binPath = join(tempDir, assetName);
  const sumsPath = join(tempDir, "SHA256SUMS");

  await downloadTo(deps.fetchImpl, asset.url, binPath);
  await downloadTo(deps.fetchImpl, sumsAsset.url, sumsPath);

  const expectedHash = await findExpectedHash(sumsPath, assetName);
  const actualHash = await hashFile(binPath);
  if (actualHash !== expectedHash) {
    throw new NetworkError(
      `SHA-256 mismatch for ${assetName}: expected ${expectedHash}, got ${actualHash}`,
    );
  }

  const swap = await swapBinary(binPath, deps.execPath, deps.platform);
  if (swap.action === "refused") {
    const result: SelfUpdateResult = {
      currentVersion: deps.currentVersion,
      latestVersion: latest.version,
      action: "refused",
      path: deps.execPath,
      reason: swap.reason,
    };
    emit(flags, result, () =>
      `${ansi.yellow("refused:")} ${swap.reason}`,
    );
    return EXIT.USAGE;
  }

  const result: SelfUpdateResult = {
    currentVersion: deps.currentVersion,
    latestVersion: latest.version,
    action: "updated",
    path: deps.execPath,
  };
  emit(flags, result, () =>
    `${ansi.green("✓")} updated ${deps.currentVersion} → ${latest.version} (${deps.execPath})`,
  );
  return EXIT.OK;
}

function isRunningFromSource(execPath: string, argv1?: string): boolean {
  const execBase = basename(execPath).toLowerCase();
  if (execBase === "bun" || execBase === "bun.exe") return true;
  if (argv1 && /[\\/]src[\\/]cli\.ts$/.test(argv1)) return true;
  return false;
}

async function downloadTo(
  fetchImpl: FetchFn,
  url: string,
  dest: string,
): Promise<void> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new NetworkError(`download failed: ${res.status} ${url}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function findExpectedHash(
  sumsPath: string,
  assetName: string,
): Promise<string> {
  const body = await readFile(sumsPath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match && match[2] === assetName) return match[1]!.toLowerCase();
  }
  throw new NetworkError(`SHA256SUMS missing entry for ${assetName}`);
}

async function hashFile(path: string): Promise<string> {
  const data = await readFile(path);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
}

async function swapBinary(
  src: string,
  target: string,
  platform: NodeJS.Platform,
): Promise<{ action: "ok" } | { action: "refused"; reason: string }> {
  if (platform === "win32") {
    const oldPath = `${target}.old`;
    try {
      await rm(oldPath, { force: true });
      await rename(target, oldPath);
      await chmod(src, 0o755).catch(() => {});
      await rename(src, target);
      return { action: "ok" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        action: "refused",
        reason: `could not replace binary on Windows (${msg}); close running locadoc processes and retry`,
      };
    }
  }
  const sibling = `${target}.new`;
  await rm(sibling, { force: true });
  const data = await readFile(src);
  await writeFile(sibling, data);
  await chmod(sibling, 0o755);
  await rename(sibling, target);
  return { action: "ok" };
}
