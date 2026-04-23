import { test, expect } from "bun:test";
import { pickFormat, table } from "../src/output.ts";

test("pickFormat: --json wins", () => {
  expect(
    pickFormat({ json: true, text: false, quiet: false }),
  ).toBe("json");
});

test("pickFormat: --text wins over json:false", () => {
  expect(
    pickFormat({ json: false, text: true, quiet: false }),
  ).toBe("text");
});

test("pickFormat: falls back to TTY detection", () => {
  const orig = process.stdout.isTTY;
  try {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    expect(pickFormat({ json: false, text: false, quiet: false })).toBe(
      "text",
    );
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });
    expect(pickFormat({ json: false, text: false, quiet: false })).toBe(
      "json",
    );
  } finally {
    Object.defineProperty(process.stdout, "isTTY", {
      value: orig,
      configurable: true,
    });
  }
});

test("table pads columns and keeps last column flush", () => {
  const out = table([
    ["slug", "name", "status"],
    ["react", "React", "ok"],
    ["vue~3", "Vue", "stale"],
  ]);
  const lines = out.split("\n");
  expect(lines).toHaveLength(3);
  expect(lines[0]?.startsWith("slug ")).toBe(true);
  expect(lines[1]?.includes("react")).toBe(true);
  expect(lines[2]?.endsWith("stale")).toBe(true);
});
