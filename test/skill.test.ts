import { test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkillTarget, runSkill } from "../src/commands/skill.ts";
import type { GlobalFlags } from "../src/types.ts";

let root: string;

const quietFlags: GlobalFlags = {
  json: true,
  text: false,
  quiet: true,
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "locadoc-skill-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("resolveSkillTarget defaults to global scope", () => {
  const out = resolveSkillTarget({ skillsRoot: root });
  expect(out.scope).toBe("global");
  expect(out.path).toBe(join(root, "locadoc", "SKILL.md"));
  expect(out.exists).toBe(false);
});

test("resolveSkillTarget project scope", () => {
  const out = resolveSkillTarget({ scope: "project", skillsRoot: root });
  expect(out.scope).toBe("project");
  expect(out.path).toBe(join(root, "locadoc", "SKILL.md"));
});

test("install writes SKILL.md and reports installed", async () => {
  const code = await runSkill(
    { verb: "install", skillsRoot: root },
    quietFlags,
  );
  expect(code).toBe(0);
  const target = join(root, "locadoc", "SKILL.md");
  expect(existsSync(target)).toBe(true);
  const body = await readFile(target, "utf8");
  expect(body.startsWith("---")).toBe(true);
  expect(body).toContain("name: locadoc");
});

test("install refuses overwrite without --force", async () => {
  await runSkill({ verb: "install", skillsRoot: root }, quietFlags);
  const code = await runSkill(
    { verb: "install", skillsRoot: root },
    quietFlags,
  );
  expect(code).toBe(2);
});

test("install --force overwrites existing file", async () => {
  const target = join(root, "locadoc", "SKILL.md");
  await mkdir(join(root, "locadoc"), { recursive: true });
  await writeFile(target, "old", "utf8");
  const code = await runSkill(
    { verb: "install", skillsRoot: root, force: true },
    quietFlags,
  );
  expect(code).toBe(0);
  const body = await readFile(target, "utf8");
  expect(body).toContain("name: locadoc");
  expect(body).not.toBe("old");
});

test("install --dry-run does not touch the filesystem", async () => {
  const code = await runSkill(
    { verb: "install", skillsRoot: root, dryRun: true },
    quietFlags,
  );
  expect(code).toBe(0);
  expect(existsSync(join(root, "locadoc"))).toBe(false);
});

test("uninstall removes the skill directory", async () => {
  await runSkill({ verb: "install", skillsRoot: root }, quietFlags);
  const code = await runSkill(
    { verb: "uninstall", skillsRoot: root },
    quietFlags,
  );
  expect(code).toBe(0);
  expect(existsSync(join(root, "locadoc"))).toBe(false);
});

test("uninstall on absent skill returns NOT_FOUND", async () => {
  const code = await runSkill(
    { verb: "uninstall", skillsRoot: root },
    quietFlags,
  );
  expect(code).toBe(1);
});

test("unknown verb returns USAGE", async () => {
  const code = await runSkill(
    { verb: "grow-wings", skillsRoot: root },
    quietFlags,
  );
  expect(code).toBe(2);
});

test("no verb returns USAGE", async () => {
  const code = await runSkill({ skillsRoot: root }, quietFlags);
  expect(code).toBe(2);
});
