import { test, expect } from "bun:test";
import {
  htmlToMarkdown,
  markdownToAnsi,
  sliceByFragment,
} from "../src/render.ts";

test("headings and paragraphs convert cleanly", () => {
  const md = htmlToMarkdown(`
    <h1>useEffect</h1>
    <p>Accepts a function.</p>
    <h2>Parameters</h2>
    <ul><li><code>effect</code></li></ul>
  `);
  expect(md).toContain("# useEffect");
  expect(md).toContain("## Parameters");
  expect(md).toContain("`effect`");
  expect(md).toContain("Accepts a function.");
});

test("pre with data-language becomes fenced code block", () => {
  const md = htmlToMarkdown(
    `<pre data-language="typescript">const x: number = 1;\nconsole.log(x);</pre>`,
  );
  expect(md).toContain("```typescript");
  expect(md).toContain("const x: number = 1;");
  expect(md.split("```").length).toBe(3);
});

test("pre > code with class preserves language", () => {
  const md = htmlToMarkdown(
    `<pre><code class="language-bash">echo hi</code></pre>`,
  );
  expect(md).toContain("```bash");
  expect(md).toContain("echo hi");
});

test("sliceByFragment extracts one section", () => {
  const html = `
    <h1>Page</h1>
    <h2 id="alpha">Alpha</h2>
    <p>alpha body.</p>
    <h2 id="beta">Beta</h2>
    <p>beta body.</p>
  `;
  const sliced = sliceByFragment(html, "alpha");
  expect(sliced.title).toBe("Alpha");
  expect(sliced.html).toContain("alpha body");
  expect(sliced.html).not.toContain("beta body");
});

test("sliceByFragment returns full html when fragment missing", () => {
  const html = `<h1>Page</h1><p>hi</p>`;
  const out = sliceByFragment(html, "nope");
  expect(out.html).toContain("hi");
  expect(out.fragment).toBe("nope");
});

test("strips ._attribution block", () => {
  const html = `<h1>x</h1><p>body</p><p class="_attribution">© xyz</p>`;
  const out = sliceByFragment(html);
  expect(out.html).not.toContain("_attribution");
  expect(out.html).not.toContain("© xyz");
});

test("markdownToAnsi escapes headings with bold", () => {
  const out = markdownToAnsi("# Title\n\nbody\n");
  expect(out).toContain("Title");
  expect(out).not.toContain("# Title");
});
