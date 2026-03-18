import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  downloadFileWithProgress,
  fetchOfficialExtensionCatalog,
  resolveRuntimeTarget,
} from "../../electron/github-release";
import { DB_MANAGEMENT_EXTENSION_ID } from "../../shared/schema";

test("resolveRuntimeTarget maps known platform and arch combinations", () => {
  assert.equal(resolveRuntimeTarget("win32", "x64"), "win32-x64");
  assert.equal(resolveRuntimeTarget("darwin", "arm64"), "darwin-arm64");
  assert.equal(resolveRuntimeTarget("linux", "x64"), "linux-x64");
  assert.equal(resolveRuntimeTarget("linux", "arm"), undefined);
});

test("fetchOfficialExtensionCatalog resolves the manifest asset and current platform package", async () => {
  const runtimeTarget = resolveRuntimeTarget();
  assert.ok(runtimeTarget, "Current test runtime should resolve to a supported target");

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/repos/SevenThRe/Db-Schema-Ddl/releases")) {
      return new Response(
        JSON.stringify([
          {
            tag_name: "v1.2.0",
            html_url: "https://example.com/releases/v1.2.0",
            body: "Latest official extension",
            published_at: "2026-03-17T00:00:00.000Z",
            assets: [
              {
                name: "db-management-extension-manifest.json",
                browser_download_url: "https://example.com/db-management-extension-manifest.json",
                size: 256,
              },
            ],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url === "https://example.com/db-management-extension-manifest.json") {
      return new Response(
        JSON.stringify({
          extensionId: DB_MANAGEMENT_EXTENSION_ID,
          name: "DB 管理",
          shortName: "DB",
          description: "官方扩展",
          publisher: "SevenThRe",
          source: "official",
          official: true,
          hostApiVersion: 1,
          recommended: true,
          version: "1.2.0",
          summary: "Adds GitHub delivery",
          releaseNotes: "Single-panel progress view",
          packages: [
            {
              target: runtimeTarget,
              assetName: "db-management-extension.zip",
              downloadUrl: "https://example.com/db-management-extension.zip",
              size: 1024,
              sha256: "0123456789abcdef0123456789abcdef",
              releaseUrl: "https://example.com/releases/v1.2.0",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const catalog = await fetchOfficialExtensionCatalog(DB_MANAGEMENT_EXTENSION_ID, mockFetch);

  assert.equal(catalog.release.version, "1.2.0");
  assert.equal(catalog.release.package?.assetName, "db-management-extension.zip");
  assert.equal(catalog.release.compatibilityStatus, "compatible");
  assert.equal(catalog.manifest.summary, "Adds GitHub delivery");
});

test("downloadFileWithProgress writes the fetched asset to disk and reports progress", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ext-download-test-"));
  const outputPath = path.join(tempDir, "extension.zip");
  const progressEvents: number[] = [];

  const mockFetch: typeof fetch = async () =>
    new Response("zip-bytes", {
      status: 200,
      headers: {
        "content-length": "9",
      },
    });

  try {
    await downloadFileWithProgress("https://example.com/db-management-extension.zip", outputPath, (downloadedBytes) => {
      progressEvents.push(downloadedBytes);
    }, mockFetch);

    const contents = await readFile(outputPath, "utf8");
    assert.equal(contents, "zip-bytes");
    assert.ok(progressEvents.length >= 1);
    assert.equal(progressEvents.at(-1), 9);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
