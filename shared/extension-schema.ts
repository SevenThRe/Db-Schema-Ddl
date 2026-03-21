import { z } from "zod";

// ──────────────────────────────────────────────
// 拡張機能ライフサイクルステージ
// ──────────────────────────────────────────────

export const extensionLifecycleStageSchema = z.enum([
  "not_installed",
  "downloading",
  "verifying",
  "installed",
  "starting",
  "running",
  "stopping",
  "error",
]);

export type ExtensionLifecycleStage = z.infer<typeof extensionLifecycleStageSchema>;

// ──────────────────────────────────────────────
// 拡張機能 Capability（権限宣言）
// ──────────────────────────────────────────────

export const extensionCapabilitySchema = z.enum([
  "db.connect",
  "db.query",
  "db.schema.read",
  "db.schema.apply",
]);

export type ExtensionCapability = z.infer<typeof extensionCapabilitySchema>;

// ──────────────────────────────────────────────
// 対応プラットフォーム
// ──────────────────────────────────────────────

export const extensionPlatformSchema = z.enum([
  "win32-x64",
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
]);

export type ExtensionPlatform = z.infer<typeof extensionPlatformSchema>;

// ──────────────────────────────────────────────
// manifest.json スキーマ（ZIPに同梱）
// ──────────────────────────────────────────────

export const extensionManifestSchema = z.object({
  /** 拡張機能の一意 ID（ケバブケース） */
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  /** 表示名 */
  name: z.string().min(1),
  /** セマンティックバージョン */
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  /** ホスト API バージョン（互換性チェック用） */
  api_version: z.number().int().positive(),
  /** 発行者 */
  publisher: z.string().min(1),
  /** 説明文 */
  description: z.string().default(""),
  /** リリースノート（任意） */
  release_notes: z.string().optional(),
  /** 最低要求ホストバージョン */
  min_host_version: z.string().regex(/^\d+\.\d+\.\d+/).optional(),
  /** プラットフォーム別エントリーポイント */
  entry: z.record(extensionPlatformSchema, z.string()),
  /** 要求する Capability 一覧 */
  capabilities: z.array(extensionCapabilitySchema).default([]),
});

export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;

// ──────────────────────────────────────────────
// GitHub Catalog（最新リリース情報）
// ──────────────────────────────────────────────

export const extensionCatalogSchema = z.object({
  latest_version: z.string(),
  release_notes: z.string().default(""),
  platforms: z.record(
    extensionPlatformSchema,
    z.object({
      download_url: z.string().url(),
      sha256: z.string().length(64),
      size_bytes: z.number().int().nonnegative(),
    }),
  ),
  published_at: z.string(),
  update_available: z.boolean().default(false),
});

export type ExtensionCatalog = z.infer<typeof extensionCatalogSchema>;

// ──────────────────────────────────────────────
// ExtensionState（フロントエンドへの全状態）
// ──────────────────────────────────────────────

export const extensionStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  installed_version: z.string().nullable(),
  stage: extensionLifecycleStageSchema,
  capabilities: z.array(extensionCapabilitySchema),
  /** 実行中サイドカーのプロセス ID */
  pid: z.number().int().nullable(),
  /** 実行中サイドカーの HTTP ポート */
  port: z.number().int().nullable(),
  /** エラーメッセージ（stage === "error" 時） */
  error: z.string().nullable(),
  /** ダウンロード進捗 0-100（stage === "downloading" 時） */
  download_progress: z.number().min(0).max(100).nullable(),
  /** GitHub から取得した最新カタログ情報 */
  catalog: extensionCatalogSchema.nullable(),
});

export type ExtensionState = z.infer<typeof extensionStateSchema>;

// ──────────────────────────────────────────────
// ext_call リクエスト / レスポンス
// ──────────────────────────────────────────────

export const extCallRequestSchema = z.object({
  extension_id: z.string(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export type ExtCallRequest = z.infer<typeof extCallRequestSchema>;

export const extCallResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});

export type ExtCallResponse = z.infer<typeof extCallResponseSchema>;

// ──────────────────────────────────────────────
// 既知の公式拡張機能 ID
// ──────────────────────────────────────────────

export const OFFICIAL_EXTENSIONS = {
  DB_MANAGEMENT: "db-management",
} as const;

export type OfficialExtensionId =
  (typeof OFFICIAL_EXTENSIONS)[keyof typeof OFFICIAL_EXTENSIONS];
