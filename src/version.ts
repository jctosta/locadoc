export const VERSION = "0.1.0";

export function normalizeTag(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

interface Parsed {
  core: [number, number, number];
  pre?: string;
}

function parseSemver(v: string): Parsed {
  const [core, pre] = normalizeTag(v).split("-", 2) as [string, string?];
  const parts = core.split(".").map((n) => {
    const x = parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  return {
    core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    pre: pre && pre.length > 0 ? pre : undefined,
  };
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const na = parseSemver(a);
  const nb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const av = na.core[i] ?? 0;
    const bv = nb.core[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  if (!na.pre && nb.pre) return 1;
  if (na.pre && !nb.pre) return -1;
  if (na.pre && nb.pre) {
    if (na.pre < nb.pre) return -1;
    if (na.pre > nb.pre) return 1;
  }
  return 0;
}
