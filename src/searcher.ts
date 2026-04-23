// SPDX-License-Identifier: MPL-2.0
//
// This file is a TypeScript port of freeCodeCamp/devdocs'
// assets/javascripts/app/searcher.js. The rest of locadoc is MIT-licensed;
// per MPL 2.0's file-level copyleft this file remains MPL 2.0.
// Source: https://github.com/freeCodeCamp/devdocs

const SEPARATOR = ".";

const SEPARATORS_REGEXP =
  /#|::|:-|->|\$(?=\w)|-(?=\w)|:(?=\w)| [/\-&] |: | /g;
const EOS_SEPARATORS_REGEXP = /(\w)[-:]$/;
const INFO_PARANTHESES_REGEXP = / \(\w+?\)$/;
const EMPTY_PARANTHESES_REGEXP = /\(\)/;
const EVENT_REGEXP = / event$/;
const DOT_REGEXP = /\.+/g;
const WHITESPACE_REGEXP = /\s/g;
const ELLIPSIS = "...";
const REGEXP_SPECIAL = /[\\^$.*+?()[\]{}|]/g;

export function normalizeString(input: string): string {
  return input
    .toLowerCase()
    .split(ELLIPSIS)
    .join("")
    .replace(EVENT_REGEXP, "")
    .replace(INFO_PARANTHESES_REGEXP, "")
    .replace(SEPARATORS_REGEXP, SEPARATOR)
    .replace(DOT_REGEXP, SEPARATOR)
    .replace(EMPTY_PARANTHESES_REGEXP, "")
    .replace(WHITESPACE_REGEXP, "");
}

export function normalizeQuery(input: string): string {
  return normalizeString(input).replace(EOS_SEPARATORS_REGEXP, "$1.");
}

function escapeRegexp(s: string): string {
  return s.replace(REGEXP_SPECIAL, "\\$&");
}

export function queryToFuzzyRegexp(q: string): RegExp {
  return new RegExp(q.split("").map(escapeRegexp).join(".*?"));
}

interface MatchCtx {
  query: string;
  queryLength: number;
  value: string;
  valueLength: number;
  fuzzyRegexp: RegExp | null;
}

function scoreExactMatch(ctx: MatchCtx, initialIndex: number): number | null {
  const { queryLength, value, valueLength } = ctx;
  const index = initialIndex;
  let score = 100 - (valueLength - queryLength);

  if (index > 0) {
    if (value.charAt(index - 1) === SEPARATOR) {
      score += index - 1;
    } else if (queryLength === 1) {
      return null;
    } else {
      let i = index - 2;
      while (i >= 0 && value.charAt(i) !== SEPARATOR) i--;
      score -= (index - i) + (valueLength - queryLength - index);
    }

    let separators = 0;
    let i = index - 2;
    while (i >= 0) {
      if (value.charAt(i) === SEPARATOR) separators++;
      i--;
    }
    score -= separators;
  }

  let trailing = 0;
  let i = valueLength - queryLength - index - 1;
  while (i >= 0) {
    if (value.charAt(index + queryLength + i) === SEPARATOR) trailing++;
    i--;
  }
  score -= trailing * 5;

  return Math.max(1, score);
}

function tryExactMatch(ctx: MatchCtx): number | null {
  const first = ctx.value.indexOf(ctx.query);
  if (first < 0) return null;
  const last = ctx.value.lastIndexOf(ctx.query);
  if (first !== last) {
    const a = scoreExactMatch(ctx, first) ?? 0;
    const b = scoreExactMatch(ctx, last) ?? 0;
    const best = Math.max(a, b);
    return best > 0 ? best : null;
  }
  return scoreExactMatch(ctx, first);
}

function scoreFuzzyAt(
  valueLength: number,
  matchIndex: number,
  matchLength: number,
  value: string,
): number {
  if (matchIndex === 0 || value.charAt(matchIndex - 1) === SEPARATOR) {
    return Math.max(66, 100 - matchLength);
  }
  if (matchIndex + matchLength === valueLength) {
    return Math.max(33, 67 - matchLength);
  }
  return Math.max(1, 34 - matchLength);
}

function tryFuzzyMatch(ctx: MatchCtx): number | null {
  if (ctx.valueLength <= ctx.queryLength || ctx.value.includes(ctx.query)) {
    return null;
  }
  if (!ctx.fuzzyRegexp) return null;
  const m1 = ctx.value.match(ctx.fuzzyRegexp);
  if (!m1 || m1.index === undefined) return null;
  const first = scoreFuzzyAt(ctx.valueLength, m1.index, m1[0].length, ctx.value);

  const afterLastDot = ctx.value.lastIndexOf(SEPARATOR) + 1;
  if (afterLastDot > 0) {
    const tail = ctx.value.slice(afterLastDot);
    const m2 = tail.match(ctx.fuzzyRegexp);
    if (m2 && m2.index !== undefined) {
      const second = scoreFuzzyAt(
        ctx.valueLength,
        afterLastDot + m2.index,
        m2[0].length,
        ctx.value,
      );
      return Math.max(first, second);
    }
  }
  return first;
}

export interface SearchItem {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface SearchOptions {
  fuzzyMinLength?: number;
  maxResults?: number;
}

export interface Scored<T> {
  readonly item: T;
  readonly score: number;
}

export function searchEntries<T extends SearchItem>(
  entries: readonly T[],
  rawQuery: string,
  opts: SearchOptions = {},
): Scored<T>[] {
  const query = normalizeQuery(rawQuery);
  if (query.length === 0 || query === SEPARATOR) return [];

  const fuzzyMinLength = opts.fuzzyMinLength ?? 3;
  const maxResults = opts.maxResults ?? 50;

  const fuzzyRegexp =
    query.length >= fuzzyMinLength ? queryToFuzzyRegexp(query) : null;

  const scoreMap: T[][] = [];

  const runMatcher = (matcher: (ctx: MatchCtx) => number | null): void => {
    for (const entry of entries) {
      const value = normalizeString(String(entry.name));
      const ctx: MatchCtx = {
        query,
        queryLength: query.length,
        value,
        valueLength: value.length,
        fuzzyRegexp,
      };
      const s = matcher(ctx);
      if (s !== null && s > 0) {
        const bucket = Math.round(s);
        (scoreMap[bucket] ??= []).push(entry);
      }
    }
  };

  runMatcher(tryExactMatch);
  if (fuzzyRegexp) runMatcher(tryFuzzyMatch);

  const results: Scored<T>[] = [];
  const seen = new Set<T>();
  for (let bucket = scoreMap.length - 1; bucket >= 0; bucket--) {
    const items = scoreMap[bucket];
    if (!items) continue;
    for (const item of items) {
      if (seen.has(item)) continue;
      seen.add(item);
      results.push({ item, score: bucket });
      if (results.length >= maxResults) return results;
    }
  }
  return results;
}
