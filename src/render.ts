import { parse, type HTMLElement, type Node } from "node-html-parser";
import TurndownService from "turndown";
import { ansi } from "./output.ts";

const STRIP_SELECTORS = [
  "._attribution",
  ".breadcrumbs",
  ".attribution",
  ".deprecated-notice",
];

function buildTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });

  td.addRule("fencedPre", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const el = node as unknown as {
        textContent: string;
        getAttribute?: (n: string) => string | null;
        firstChild: {
          nodeName: string;
          textContent?: string;
          getAttribute?: (n: string) => string | null;
        } | null;
      };
      const code =
        el.firstChild && el.firstChild.nodeName === "CODE"
          ? el.firstChild
          : el;
      const raw = (code.textContent ?? "").replace(/\n$/, "");
      const lang =
        el.getAttribute?.("data-language") ??
        el.getAttribute?.("language") ??
        extractLang(el.getAttribute?.("class") ?? "") ??
        (code !== el
          ? extractLang(code.getAttribute?.("class") ?? "")
          : undefined) ??
        "";
      return `\n\n\`\`\`${lang}\n${raw}\n\`\`\`\n\n`;
    },
  });

  return td;
}

function extractLang(cls: string): string | undefined {
  const m = cls.match(/(?:^|\s)(?:lang|language|highlight)-([A-Za-z0-9+#._-]+)/);
  return m?.[1];
}

export interface SlicedHtml {
  html: string;
  title: string;
  fragment?: string;
}

export function sliceByFragment(
  rawHtml: string,
  fragment?: string,
): SlicedHtml {
  const root = parse(rawHtml);
  for (const sel of STRIP_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) el.remove();
  }
  const title =
    root.querySelector("h1")?.textContent?.trim() ??
    root.querySelector("h2")?.textContent?.trim() ??
    "";

  if (!fragment) {
    return { html: root.toString(), title };
  }

  const anchor =
    root.querySelector(`#${cssEscape(fragment)}`) ??
    root.querySelector(`[name="${fragment}"]`);
  if (!anchor) return { html: root.toString(), title, fragment };

  const heading = findEnclosingHeading(anchor);
  if (!heading) return { html: root.toString(), title, fragment };

  const level = headingLevel(heading);
  const collected: Node[] = [heading];
  let sib: Node | null = (heading as unknown as {
    nextElementSibling: HTMLElement | null;
  }).nextElementSibling;
  while (sib) {
    if (isHeading(sib) && headingLevel(sib as HTMLElement) <= level) break;
    collected.push(sib);
    sib = (sib as unknown as { nextElementSibling: HTMLElement | null })
      .nextElementSibling;
  }
  const slicedTitle = (heading as HTMLElement).textContent?.trim() ?? title;
  return {
    html: collected.map((n) => n.toString()).join(""),
    title: slicedTitle,
    fragment,
  };
}

function cssEscape(s: string): string {
  return s.replace(/([^A-Za-z0-9\-_])/g, "\\$1");
}

function isHeading(node: Node): boolean {
  const name = (node as unknown as { rawTagName?: string }).rawTagName;
  return !!name && /^h[1-6]$/i.test(name);
}

function headingLevel(h: HTMLElement): number {
  const m = (h.rawTagName ?? "").match(/^h([1-6])$/i);
  return m ? Number(m[1]) : 6;
}

function findEnclosingHeading(el: Node): HTMLElement | null {
  let cur: Node | null = el;
  while (cur) {
    if (isHeading(cur)) return cur as HTMLElement;
    const parent: Node | null = (cur as unknown as { parentNode: Node | null })
      .parentNode;
    if (parent && parent !== cur) {
      let prev: Node | null = (cur as unknown as {
        previousElementSibling: HTMLElement | null;
      }).previousElementSibling;
      while (prev) {
        if (isHeading(prev)) return prev as HTMLElement;
        const sub = (prev as HTMLElement).querySelector?.(
          "h1, h2, h3, h4, h5, h6",
        );
        if (sub) return sub;
        prev = (prev as unknown as {
          previousElementSibling: HTMLElement | null;
        }).previousElementSibling;
      }
      cur = parent;
    } else {
      cur = null;
    }
  }
  return null;
}

let turndownSingleton: TurndownService | null = null;

export function htmlToMarkdown(html: string): string {
  if (!turndownSingleton) turndownSingleton = buildTurndown();
  return turndownSingleton.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

export function markdownToAnsi(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      out.push(ansi.dim(line));
      continue;
    }
    if (inFence) {
      out.push(ansi.cyan(line));
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push(ansi.bold(h[2] ?? ""));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      out.push(line.replace(/^([-*])\s+/, (_, m) => ansi.dim(`${m} `)));
      continue;
    }
    if (/^>\s?/.test(line)) {
      out.push(ansi.dim(line));
      continue;
    }
    out.push(styleInline(line));
  }
  return out.join("\n");
}

function styleInline(line: string): string {
  return line
    .replace(/`([^`]+)`/g, (_, code) => ansi.cyan(code))
    .replace(/\*\*([^*]+)\*\*/g, (_, s) => ansi.bold(s))
    .replace(/_([^_]+)_/g, (_, s) => ansi.dim(s));
}
