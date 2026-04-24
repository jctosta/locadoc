import { NetworkError } from "./devdocs.ts";
import { normalizeTag } from "./version.ts";

export const REPO = "jctosta/locadoc";
const UA = "locadoc-self-update (+https://github.com/jctosta/locadoc)";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  tag: string;
  version: string;
  assets: ReleaseAsset[];
  publishedAt: string;
}

export type FetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchLatestOpts {
  repo?: string;
  fetchImpl?: FetchFn;
}

export function githubApiBase(): string {
  return process.env.LOCADOC_GITHUB_API_BASE ?? "https://api.github.com";
}

export async function fetchLatestRelease(
  opts: FetchLatestOpts = {},
): Promise<ReleaseInfo> {
  const repo = opts.repo ?? REPO;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${githubApiBase()}/repos/${repo}/releases/latest`;
  const res = await fetchImpl(url, {
    headers: {
      "user-agent": UA,
      accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new NetworkError(
      `GitHub release fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as {
    tag_name: string;
    published_at: string;
    assets: Array<{
      name: string;
      browser_download_url: string;
      size: number;
    }>;
  };
  return {
    tag: body.tag_name,
    version: normalizeTag(body.tag_name),
    assets: body.assets.map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    })),
    publishedAt: body.published_at,
  };
}

export function pickAssetName(
  platform: NodeJS.Platform,
  arch: string,
): string {
  const os =
    platform === "darwin"
      ? "darwin"
      : platform === "win32"
        ? "windows"
        : "linux";
  const cpu = arch === "arm64" ? "arm64" : "x64";
  const ext = os === "windows" ? ".exe" : "";
  return `locadoc-${os}-${cpu}${ext}`;
}
