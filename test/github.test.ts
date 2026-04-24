import { test, expect } from "bun:test";
import {
  fetchLatestRelease,
  pickAssetName,
  type FetchFn,
} from "../src/github.ts";
import { NetworkError } from "../src/devdocs.ts";

test("pickAssetName covers supported matrix", () => {
  expect(pickAssetName("darwin", "x64")).toBe("locadoc-darwin-x64");
  expect(pickAssetName("darwin", "arm64")).toBe("locadoc-darwin-arm64");
  expect(pickAssetName("linux", "x64")).toBe("locadoc-linux-x64");
  expect(pickAssetName("linux", "arm64")).toBe("locadoc-linux-arm64");
  expect(pickAssetName("win32", "x64")).toBe("locadoc-windows-x64.exe");
});

test("pickAssetName falls back to linux for unknown platforms", () => {
  expect(pickAssetName("freebsd" as NodeJS.Platform, "x64")).toBe(
    "locadoc-linux-x64",
  );
  expect(pickAssetName("linux", "mips")).toBe("locadoc-linux-x64");
});

test("fetchLatestRelease parses GitHub response", async () => {
  const fetchImpl: FetchFn = async () =>
    new Response(
      JSON.stringify({
        tag_name: "v0.2.0",
        published_at: "2026-04-20T00:00:00Z",
        assets: [
          {
            name: "locadoc-linux-x64",
            browser_download_url: "https://example/linux",
            size: 12345,
          },
          {
            name: "SHA256SUMS",
            browser_download_url: "https://example/sums",
            size: 67,
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const info = await fetchLatestRelease({ fetchImpl });
  expect(info.tag).toBe("v0.2.0");
  expect(info.version).toBe("0.2.0");
  expect(info.assets).toHaveLength(2);
  expect(info.assets[0]?.url).toBe("https://example/linux");
});

test("fetchLatestRelease throws NetworkError on non-2xx", async () => {
  const fetchImpl: FetchFn = async () =>
    new Response("rate limited", { status: 403 });

  let caught: unknown;
  try {
    await fetchLatestRelease({ fetchImpl });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(NetworkError);
});
