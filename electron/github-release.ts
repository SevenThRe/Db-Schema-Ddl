import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import {
  type ExtensionCatalogRelease,
  type ExtensionId,
  type ExtensionManifestPackage,
  type ExtensionRuntimeTarget,
  type OfficialExtensionManifest,
  OFFICIAL_EXTENSION_GITHUB_OWNER,
  OFFICIAL_EXTENSION_GITHUB_REPO,
  OFFICIAL_EXTENSION_MANIFEST_ASSET_NAME,
  officialExtensionManifestSchema,
} from "@shared/schema";

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

interface GithubReleaseResponse {
  tag_name: string;
  html_url: string;
  body?: string;
  published_at?: string;
  assets?: GithubReleaseAsset[];
}

export interface ResolvedOfficialExtensionCatalog {
  extensionId: ExtensionId;
  manifest: OfficialExtensionManifest;
  release: ExtensionCatalogRelease;
  runtimeTarget?: ExtensionRuntimeTarget;
}

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

function buildGithubHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "DBSchemaExcel2DDL",
  };
}

export function resolveRuntimeTarget(
  platform = process.platform,
  arch = process.arch,
): ExtensionRuntimeTarget | undefined {
  const candidate = `${platform}-${arch}`;
  switch (candidate) {
    case "win32-x64":
    case "win32-arm64":
    case "darwin-x64":
    case "darwin-arm64":
    case "linux-x64":
      return candidate;
    default:
      return undefined;
  }
}

function getGithubApiBaseUrl(): string {
  return process.env.EXTENSION_GITHUB_API_BASE_URL?.trim() || DEFAULT_GITHUB_API_BASE_URL;
}

function getGithubReleasesApiUrl(): string {
  return `${getGithubApiBaseUrl()}/repos/${OFFICIAL_EXTENSION_GITHUB_OWNER}/${OFFICIAL_EXTENSION_GITHUB_REPO}/releases`;
}

function pickManifestAsset(releases: GithubReleaseResponse[]): GithubReleaseAsset | undefined {
  for (const release of releases) {
    const asset = release.assets?.find((item) => item.name === OFFICIAL_EXTENSION_MANIFEST_ASSET_NAME);
    if (asset) {
      return asset;
    }
  }
  return undefined;
}

function findReleaseForAsset(
  releases: GithubReleaseResponse[],
  assetName: string,
): GithubReleaseResponse | undefined {
  return releases.find((release) => release.assets?.some((asset) => asset.name === assetName));
}

function pickRuntimePackage(
  manifest: OfficialExtensionManifest,
  runtimeTarget: ExtensionRuntimeTarget | undefined,
): ExtensionManifestPackage | undefined {
  if (!runtimeTarget) {
    return undefined;
  }
  return manifest.packages.find((pkg) => pkg.target === runtimeTarget);
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, { headers: buildGithubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchOfficialExtensionCatalog(
  extensionId: ExtensionId,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedOfficialExtensionCatalog> {
  const releases = await fetchJson<GithubReleaseResponse[]>(getGithubReleasesApiUrl(), fetchImpl);
  const manifestAsset = pickManifestAsset(releases);
  if (!manifestAsset) {
    throw new Error("Official extension manifest asset was not found on GitHub releases.");
  }

  const manifestPayload = await fetchJson<unknown>(manifestAsset.browser_download_url, fetchImpl);
  const manifest = officialExtensionManifestSchema.parse(manifestPayload);
  const runtimeTarget = resolveRuntimeTarget();
  const packageTarget = pickRuntimePackage(manifest, runtimeTarget);
  const release = findReleaseForAsset(releases, manifestAsset.name);

  const compatibilityStatus = packageTarget ? "compatible" : "incompatible";
  const compatibilityMessage = packageTarget
    ? undefined
    : runtimeTarget
      ? `官方扩展暂未提供 ${runtimeTarget} 安装包。`
      : "当前运行平台暂不支持官方扩展安装。";

  return {
    extensionId,
    manifest,
    runtimeTarget,
    release: {
      version: manifest.version,
      tagName: release?.tag_name,
      summary: manifest.summary,
      releaseNotes: manifest.releaseNotes ?? release?.body,
      publishedAt: release?.published_at,
      releaseUrl: packageTarget?.releaseUrl ?? release?.html_url,
      package: packageTarget,
      compatibilityStatus,
      compatibilityMessage,
      checkedAt: new Date().toISOString(),
    },
  };
}

export async function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(url, { headers: buildGithubHeaders() });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download extension asset (${response.status})`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const totalBytesHeader = response.headers.get("content-length");
  const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : undefined;
  const fileStream = fs.createWriteStream(destinationPath);
  const reader = response.body.getReader();
  let downloadedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      downloadedBytes += value.byteLength;
      fileStream.write(Buffer.from(value));
      onProgress?.(downloadedBytes, totalBytes);
    }
  } catch (error) {
    await unlink(destinationPath).catch(() => undefined);
    throw error;
  } finally {
    await new Promise<void>((resolve) => fileStream.end(resolve));
  }
}

export async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
