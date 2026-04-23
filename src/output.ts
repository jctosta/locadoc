import type { GlobalFlags, OutputFormat } from "./types.ts";

export function pickFormat(flags: GlobalFlags): OutputFormat {
  if (flags.json) return "json";
  if (flags.text) return "text";
  return process.stdout.isTTY ? "text" : "json";
}

export function emit(
  flags: GlobalFlags,
  data: unknown,
  textRenderer: () => string,
): void {
  if (pickFormat(flags) === "json") {
    process.stdout.write(JSON.stringify(data) + "\n");
  } else {
    const out = textRenderer();
    if (out.length > 0) {
      process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    }
  }
}

export function log(flags: GlobalFlags, msg: string): void {
  if (flags.quiet) return;
  process.stderr.write(msg + "\n");
}

export function useColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export const ansi = {
  bold: (s: string) => (useColor() ? `\x1b[1m${s}\x1b[22m` : s),
  dim: (s: string) => (useColor() ? `\x1b[2m${s}\x1b[22m` : s),
  red: (s: string) => (useColor() ? `\x1b[31m${s}\x1b[39m` : s),
  green: (s: string) => (useColor() ? `\x1b[32m${s}\x1b[39m` : s),
  yellow: (s: string) => (useColor() ? `\x1b[33m${s}\x1b[39m` : s),
  cyan: (s: string) => (useColor() ? `\x1b[36m${s}\x1b[39m` : s),
  magenta: (s: string) => (useColor() ? `\x1b[35m${s}\x1b[39m` : s),
};

export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i] ?? "";
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    }
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) =>
          i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0),
        )
        .join("  "),
    )
    .join("\n");
}
