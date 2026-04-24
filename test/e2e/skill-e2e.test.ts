import { test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./helpers/spawn.ts";

let home: string;
let skillsRoot: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "locadoc-skill-e2e-"));
  skillsRoot = mkdtempSync(join(tmpdir(), "locadoc-skill-e2e-skills-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(skillsRoot, { recursive: true, force: true });
});

test("skill install writes SKILL.md under --skills-root", async () => {
  const res = await runCli({
    args: [
      "skill",
      "install",
      "--skills-root",
      skillsRoot,
      "--json",
    ],
    home,
  });
  expect(res.code).toBe(0);
  const target = join(skillsRoot, "locadoc", "SKILL.md");
  expect(existsSync(target)).toBe(true);
});

test("skill install refuses overwrite without --force", async () => {
  await runCli({
    args: ["skill", "install", "--skills-root", skillsRoot, "--json"],
    home,
  });
  const res = await runCli({
    args: ["skill", "install", "--skills-root", skillsRoot, "--json"],
    home,
  });
  expect(res.code).toBe(2);
});

test("skill uninstall removes the installed skill", async () => {
  await runCli({
    args: ["skill", "install", "--skills-root", skillsRoot, "--json"],
    home,
  });
  const res = await runCli({
    args: ["skill", "uninstall", "--skills-root", skillsRoot, "--json"],
    home,
  });
  expect(res.code).toBe(0);
  expect(existsSync(join(skillsRoot, "locadoc"))).toBe(false);
});
