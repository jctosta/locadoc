import { existsSync } from "node:fs";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ansi, emit, log } from "../output.ts";
import {
  EXIT,
  type GlobalFlags,
  type SkillInstallResult,
  type SkillScope,
  type SkillWhereResult,
} from "../types.ts";
import SKILL_BODY from "../../.claude/skills/locadoc/SKILL.md" with {
  type: "text",
};

const SKILL_NAME = "locadoc";

export interface SkillArgs {
  verb?: string;
  scope?: SkillScope;
  force?: boolean;
  dryRun?: boolean;
  skillsRoot?: string;
}

export async function runSkill(
  args: SkillArgs,
  flags: GlobalFlags,
): Promise<number> {
  const verb = args.verb;
  if (!verb) {
    process.stderr.write(skillHelp());
    return EXIT.USAGE;
  }

  switch (verb) {
    case "install":
      return await doInstall(args, flags);
    case "uninstall":
      return await doUninstall(args, flags);
    case "where":
      return doWhere(args, flags);
    case "show":
      process.stdout.write(SKILL_BODY);
      if (!SKILL_BODY.endsWith("\n")) process.stdout.write("\n");
      return EXIT.OK;
    case "--help":
    case "help":
      process.stdout.write(skillHelp());
      return EXIT.OK;
    default:
      process.stderr.write(
        ansi.red(`unknown skill verb: ${verb}\n\n`) + skillHelp(),
      );
      return EXIT.USAGE;
  }
}

export function resolveSkillTarget(
  args: Pick<SkillArgs, "scope" | "skillsRoot">,
): SkillWhereResult {
  const scope: SkillScope = args.scope ?? "global";
  const root =
    args.skillsRoot ??
    (scope === "global"
      ? join(homedir(), ".claude", "skills")
      : resolve(process.cwd(), ".claude", "skills"));
  const path = join(root, SKILL_NAME, "SKILL.md");
  return { scope, path, exists: existsSync(path) };
}

async function doInstall(
  args: SkillArgs,
  flags: GlobalFlags,
): Promise<number> {
  const target = resolveSkillTarget(args);
  const bytes = Buffer.byteLength(SKILL_BODY, "utf8");

  if (args.dryRun) {
    const result: SkillInstallResult = {
      scope: target.scope,
      path: target.path,
      action: "dry-run",
      bytes,
    };
    emit(flags, result, () =>
      `${ansi.dim("dry-run:")} would write ${bytes} bytes → ${target.path}`,
    );
    return EXIT.OK;
  }

  if (target.exists && !args.force) {
    process.stderr.write(
      ansi.red(
        `skill already installed at ${target.path}\n` +
          `use --force to overwrite\n`,
      ),
    );
    return EXIT.USAGE;
  }

  try {
    await mkdir(dirname(target.path), { recursive: true });
    await writeFile(target.path, SKILL_BODY, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(ansi.red(`storage: ${msg}\n`));
    return EXIT.STORAGE;
  }

  const action: SkillInstallResult["action"] = target.exists
    ? "updated"
    : "installed";
  const result: SkillInstallResult = {
    scope: target.scope,
    path: target.path,
    action,
    bytes,
  };
  emit(flags, result, () =>
    `${ansi.green("✓")} ${action} locadoc skill → ${target.path}\n` +
    ansi.dim(
      "Claude Code will pick it up on its next session (auto-loaded from ~/.claude/skills).",
    ),
  );
  log(flags, "");
  return EXIT.OK;
}

async function doUninstall(
  args: SkillArgs,
  flags: GlobalFlags,
): Promise<number> {
  const target = resolveSkillTarget(args);

  if (!target.exists) {
    const result: SkillInstallResult = {
      scope: target.scope,
      path: target.path,
      action: "absent",
    };
    emit(flags, result, () =>
      `${ansi.dim("=")} skill not installed at ${target.path}`,
    );
    return EXIT.NOT_FOUND;
  }

  if (args.dryRun) {
    const result: SkillInstallResult = {
      scope: target.scope,
      path: target.path,
      action: "dry-run",
    };
    emit(flags, result, () =>
      `${ansi.dim("dry-run:")} would remove ${target.path}`,
    );
    return EXIT.OK;
  }

  try {
    await rm(dirname(target.path), { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(ansi.red(`storage: ${msg}\n`));
    return EXIT.STORAGE;
  }

  const result: SkillInstallResult = {
    scope: target.scope,
    path: target.path,
    action: "removed",
  };
  emit(flags, result, () =>
    `${ansi.green("✓")} removed locadoc skill (${target.path})`,
  );
  return EXIT.OK;
}

function doWhere(args: SkillArgs, flags: GlobalFlags): number {
  const target = resolveSkillTarget(args);
  emit(flags, target, () =>
    `${target.scope.padEnd(8)} ${target.path} ${
      target.exists ? ansi.green("(installed)") : ansi.dim("(not installed)")
    }`,
  );
  return EXIT.OK;
}

export async function readSkillSize(path: string): Promise<number> {
  const s = await stat(path);
  return s.size;
}

function skillHelp(): string {
  return `locadoc skill — manage the locadoc Claude Code skill

USAGE
  locadoc skill <verb> [options]

VERBS
  install             Write SKILL.md into ~/.claude/skills/locadoc/ (default: global)
  uninstall           Remove the installed skill
  where               Print the target path without touching the filesystem
  show                Print the embedded SKILL.md body to stdout

OPTIONS
  --global            Target ~/.claude/skills/ (default)
  --project           Target ./.claude/skills/ in the current directory
  --force             Overwrite an existing SKILL.md
  --dry-run           Print what would happen; do not write
  --skills-root <p>   Override the skills root directory (testing/advanced)

OUTPUT
  TTY-aware like every other locadoc command. --json and --text force either.
`;
}
