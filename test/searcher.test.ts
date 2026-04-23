import { test, expect } from "bun:test";
import {
  normalizeQuery,
  normalizeString,
  queryToFuzzyRegexp,
  searchEntries,
} from "../src/searcher.ts";

test("normalizeString lowercases and strips separators", () => {
  expect(normalizeString("Array.prototype.map()")).toBe("array.prototype.map");
  expect(normalizeString("Array#prototype")).toBe("array.prototype");
  expect(normalizeString("std::vec::Vec")).toBe("std.vec.vec");
  expect(normalizeString("foo bar")).toBe("foo.bar");
  expect(normalizeString("foo\tbar")).toBe("foobar");
});

test("normalizeQuery converts trailing separators to dots", () => {
  expect(normalizeQuery("array.")).toBe("array.");
  expect(normalizeQuery("std-")).toBe("std.");
});

test("queryToFuzzyRegexp produces gap-allowing pattern", () => {
  const r = queryToFuzzyRegexp("abc");
  expect("abc".match(r)?.[0]).toBe("abc");
  expect("aXbYc".match(r)?.[0]).toBe("aXbYc");
  expect("ac".match(r)).toBeNull();
});

const entries = [
  { docset: "react", name: "useEffect", path: "hooks/use-effect", type: "Hook" },
  { docset: "react", name: "useState", path: "hooks/use-state", type: "Hook" },
  { docset: "react", name: "Effect", path: "concepts/effect", type: "Concept" },
  { docset: "vue", name: "effect", path: "reactivity/effect", type: "API" },
  { docset: "js", name: "Array.prototype.map", path: "array/map", type: "Method" },
  { docset: "js", name: "Array.prototype.filter", path: "array/filter", type: "Method" },
];

test("exact match ranks higher than fuzzy", () => {
  const results = searchEntries(entries, "useEffect");
  expect(results[0]?.item.name).toBe("useEffect");
  expect((results[0]?.score ?? 0) > (results[1]?.score ?? 0)).toBe(true);
});

test("dot-preceded query ranks high", () => {
  const results = searchEntries(entries, "map");
  expect(results[0]?.item.name).toBe("Array.prototype.map");
});

test("short query (<3) disables fuzzy", () => {
  const results = searchEntries(entries, "ef");
  for (const r of results) {
    expect(r.item.name.toLowerCase()).toInclude("ef");
  }
});

test("empty query returns no results", () => {
  expect(searchEntries(entries, "")).toEqual([]);
});

test("maxResults bounds the output", () => {
  const results = searchEntries(entries, "e", { maxResults: 2 });
  expect(results.length).toBeLessThanOrEqual(2);
});
