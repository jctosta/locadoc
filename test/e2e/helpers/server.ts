import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FIXTURES = join(import.meta.dir, "..", "..", "fixtures");

export interface FixtureServerOpts {
  tarballSlugs?: string[];
  releaseVersion?: string;
  releaseAssets?: string[];
  manifestBody?: string;
  failManifest?: boolean;
}

export interface FixtureServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startFixtureServer(
  opts: FixtureServerOpts = {},
): Promise<FixtureServer> {
  const tarballSlugs = new Set(opts.tarballSlugs ?? []);
  const releaseVersion = opts.releaseVersion ?? "v9.9.9";
  const releaseAssets = opts.releaseAssets ?? [];
  const manifestBody =
    opts.manifestBody ??
    (await readFile(join(FIXTURES, "manifest.json"), "utf8"));

  let host = "";
  const fail500 = opts.failManifest;

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const url = new URL(req.url);

      if (url.pathname === "/docs.json") {
        if (fail500) return new Response("boom", { status: 500 });
        return new Response(manifestBody, {
          headers: { "content-type": "application/json" },
        });
      }

      const tarMatch = url.pathname.match(/^\/downloads\/([^/]+)\.tar\.gz$/);
      if (tarMatch) {
        const slug = tarMatch[1]!;
        const path = join(FIXTURES, "docsets", `${slug}.tar.gz`);
        if (!tarballSlugs.has(slug) || !existsSync(path)) {
          return new Response("not found", { status: 404 });
        }
        const body = await readFile(path);
        return new Response(body, {
          headers: { "content-type": "application/gzip" },
        });
      }

      const docMatch = url.pathname.match(/^\/documents\/([^/]+)\/(.+)$/);
      if (docMatch) {
        const slug = docMatch[1]!;
        const file = docMatch[2]!;
        const path = join(FIXTURES, "docsets", slug, file);
        if (!existsSync(path)) {
          return new Response("not found", { status: 404 });
        }
        return new Response(await readFile(path));
      }

      if (/^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(url.pathname)) {
        const assets = releaseAssets.map((name) => ({
          name,
          browser_download_url: `${host}/assets/${name}`,
          size: 1,
        }));
        return Response.json({
          tag_name: releaseVersion,
          published_at: "2026-04-01T00:00:00Z",
          assets,
        });
      }

      const assetMatch = url.pathname.match(/^\/assets\/(.+)$/);
      if (assetMatch) {
        return new Response("stub-binary\n");
      }

      return new Response(`unknown path: ${url.pathname}`, { status: 404 });
    },
  });

  host = `http://127.0.0.1:${server.port}`;

  return {
    baseUrl: host,
    close: async () => {
      server.stop(true);
    },
  };
}
