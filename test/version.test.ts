import { test, expect } from "bun:test";
import { compareSemver, normalizeTag, VERSION } from "../src/version.ts";

test("VERSION is a non-empty string", () => {
  expect(VERSION).toBeString();
  expect(VERSION.length).toBeGreaterThan(0);
});

test("normalizeTag strips leading v", () => {
  expect(normalizeTag("v0.1.0")).toBe("0.1.0");
  expect(normalizeTag("0.1.0")).toBe("0.1.0");
  expect(normalizeTag("v1.2.3-rc.1")).toBe("1.2.3-rc.1");
});

test("compareSemver orders by major/minor/patch", () => {
  expect(compareSemver("0.1.0", "0.1.1")).toBe(-1);
  expect(compareSemver("0.2.0", "0.1.9")).toBe(1);
  expect(compareSemver("1.0.0", "0.99.99")).toBe(1);
  expect(compareSemver("0.1.0", "0.1.0")).toBe(0);
});

test("compareSemver ignores leading v", () => {
  expect(compareSemver("v0.1.0", "0.1.0")).toBe(0);
  expect(compareSemver("v0.1.0", "v0.1.1")).toBe(-1);
});

test("compareSemver treats pre-release as lower than release", () => {
  expect(compareSemver("0.1.0-rc.1", "0.1.0")).toBe(-1);
  expect(compareSemver("0.1.0", "0.1.0-rc.1")).toBe(1);
  expect(compareSemver("0.1.0-rc.1", "0.1.0-rc.2")).toBe(-1);
});

test("compareSemver tolerates missing segments", () => {
  expect(compareSemver("0.1", "0.1.0")).toBe(0);
  expect(compareSemver("1", "1.0.0")).toBe(0);
});
