import { existsSync } from "node:fs";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import * as tar from "tar";
import type {
  DocsetIndex,
  DocsetMeta,
  Manifest,
  ManifestEntry,
} from "./types.ts";

const MANIFEST_URL = "https://devdocs.io/docs.json";
const BUNDLE_URL = (slug: string) =>
  `https://downloads.devdocs.io/${slug}.tar.gz`;
const DOC_URL = (slug: string, file: string) =>
  `https://documents.devdocs.io/${slug}/${file}`;

const UA = "locadoc/0.1 (+https://github.com/; devdocs CLI)";
const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchManifest(
  cachePath: string,
  force = false,
): Promise<Manifest> {
  if (!force && existsSync(cachePath)) {
    const stat = await Bun.file(cachePath).stat();
    const age = Date.now() - stat.mtimeMs;
    if (age < MANIFEST_TTL_MS) {
      const cached = await Bun.file(cachePath).text();
      return JSON.parse(cached) as Manifest;
    }
  }
  const res = await fetch(MANIFEST_URL, { headers: { "user-agent": UA } });
  if (!res.ok) {
    throw new NetworkError(
      `manifest fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.text();
  const parsed = JSON.parse(body) as Manifest;
  await writeFile(cachePath, body);
  return parsed;
}

export async function loadCachedManifest(
  cachePath: string,
): Promise<Manifest | undefined> {
  if (!existsSync(cachePath)) return undefined;
  const body = await readFile(cachePath, "utf8");
  return JSON.parse(body) as Manifest;
}

export function findDocset(
  manifest: Manifest,
  slug: string,
): ManifestEntry | undefined {
  return manifest.find((d) => d.slug === slug);
}

export async function downloadDocset(
  slug: string,
  destDir: string,
  onProgress?: (stage: string) => void,
): Promise<{ meta: DocsetMeta; index: DocsetIndex }> {
  await mkdir(destDir, { recursive: true });
  onProgress?.("fetching bundle");
  const res = await fetch(BUNDLE_URL(slug), {
    headers: { "user-agent": UA },
  });
  if (res.ok && res.body) {
    onProgress?.("extracting");
    await extractTarGz(res.body, destDir);
  } else if (res.status === 404) {
    onProgress?.("bundle 404 — falling back to JSON files");
    await downloadIndividual(slug, destDir);
  } else {
    throw new NetworkError(
      `bundle fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  const index = JSON.parse(
    await readFile(join(destDir, "index.json"), "utf8"),
  ) as DocsetIndex;
  const meta = JSON.parse(
    await readFile(join(destDir, "meta.json"), "utf8"),
  ) as DocsetMeta;
  return { meta, index };
}

async function downloadIndividual(slug: string, destDir: string) {
  const files = ["index.json", "db.json", "meta.json"];
  await Promise.all(
    files.map(async (file) => {
      const r = await fetch(DOC_URL(slug, file), {
        headers: { "user-agent": UA },
      });
      if (!r.ok) {
        throw new NetworkError(`${file} fetch failed: ${r.status}`);
      }
      await writeFile(join(destDir, file), await r.text());
    }),
  );
}

async function extractTarGz(
  body: ReadableStream<Uint8Array>,
  destDir: string,
) {
  const nodeStream = Readable.fromWeb(body as any);
  await new Promise<void>((resolve, reject) => {
    const extractor = tar.extract({ cwd: destDir, gzip: true });
    nodeStream.on("error", reject);
    extractor.on("error", reject);
    extractor.on("end", resolve);
    nodeStream.pipe(extractor);
  });
}

export async function removeDocsetDir(dir: string) {
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}
