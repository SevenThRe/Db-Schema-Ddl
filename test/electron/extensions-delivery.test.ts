import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import fs from "node:fs";
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

test("fetchOfficialExtensionCatalog returns a user-friendly message when no official manifest has been published yet", async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/repos/SevenThRe/Db-Schema-Ddl/releases")) {
      return new Response(
        JSON.stringify([
          {
            tag_name: "v1.2.0",
            html_url: "https://example.com/releases/v1.2.0",
            assets: [],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    () => fetchOfficialExtensionCatalog(DB_MANAGEMENT_EXTENSION_ID, mockFetch),
    /官方扩展暂未发布，当前还没有可下载的安装包。/,
  );
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

test("electron main lazily loads extension service after runtime paths are configured", () => {
  const mainProcessPath = path.resolve("electron/main.ts");
  const mainProcessSource = fs.readFileSync(mainProcessPath, "utf8");

  assert.doesNotMatch(mainProcessSource, /import\s+\{\s*extensionService\s*\}\s+from\s+['"]\.\/extensions['"]/);
  assert.match(mainProcessSource, /async function getExtensionService\(\): Promise<ElectronExtensionService>/);
  assert.match(mainProcessSource, /import\("\.\/extensions"\)\.then\(\(module\) => module\.extensionService\)/);
  assert.match(mainProcessSource, /const extensionService = await getExtensionService\(\);/);
});

test("electron main exposes a dedicated local db management test mode for packaged app validation", () => {
  const mainProcessPath = path.resolve("electron/main.ts");
  const mainProcessSource = fs.readFileSync(mainProcessPath, "utf8");

  assert.match(mainProcessSource, /function isLocalDbManagementTestModeEnabled\(\): boolean/);
  assert.match(mainProcessSource, /DBSCHEMA_LOCAL_DB_MANAGEMENT_TEST/);
  assert.match(mainProcessSource, /process\.argv\.includes\("--db-management-test"\)/);
  assert.match(mainProcessSource, /windowUrl\.searchParams\.set\("db-management-test", "1"\)/);
});

test("repository includes a helper script to launch packaged db management test mode", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const launcherScript = fs.readFileSync(path.resolve("script/start-db-management-test.ps1"), "utf8");

  assert.equal(
    packageJson.scripts?.["start:app:db-management-test"],
    "powershell -ExecutionPolicy Bypass -File script/start-db-management-test.ps1",
  );
  assert.match(launcherScript, /DBSCHEMA_LOCAL_DB_MANAGEMENT_TEST = "1"/);
  assert.match(launcherScript, /Start-Process -FilePath \$resolvedExecutable -WorkingDirectory \$workingDirectory -ArgumentList "--db-management-test"/);
});
