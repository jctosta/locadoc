import { join } from "node:path";

const CLI_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "src",
  "cli.ts",
);

export interface RunCliOpts {
  args: string[];
  env?: Record<string, string | undefined>;
  home?: string;
  cwd?: string;
}

export interface RunCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCli(opts: RunCliOpts): Promise<RunCliResult> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NO_COLOR: "1",
  };
  if (opts.home !== undefined) env.LOCADOC_HOME = opts.home;
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v !== undefined) env[k] = v;
  }

  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...opts.args], {
    env,
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return {
    code: proc.exitCode ?? 0,
    stdout,
    stderr,
  };
}
