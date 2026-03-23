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
  /** V2: 拡張が宣言する Contribution（Rust manifest.rs と同期） */
  contributes: z.lazy(() => extensionContributesSchema).optional(),
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

// ──────────────────────────────────────────────
// Extension Manifest V2 — 統合型拡張モデル
// builtin / external 共通の Contribution 宣言付き
// ──────────────────────────────────────────────

/** 拡張が提供するナビゲーションエントリ */
export const navigationItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  order: z.number().default(100),
});
export type NavigationItem = z.infer<typeof navigationItemSchema>;

/** 拡張が提供するワークスペースパネル */
export const workspacePanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  component: z.string().optional(),
});
export type WorkspacePanel = z.infer<typeof workspacePanelSchema>;

/** 拡張が提供する設定セクション */
export const settingsSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number().default(100),
  component: z.string().optional(),
});
export type SettingsSection = z.infer<typeof settingsSectionSchema>;

/** 拡張が提供するコンテキストアクション */
export const contextActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  context: z.enum(["connection", "schema", "table", "file"]),
  icon: z.string().optional(),
});
export type ContextAction = z.infer<typeof contextActionSchema>;

/** 拡張の Contribution 宣言 */
export const extensionContributesSchema = z.object({
  navigation: z.array(navigationItemSchema).default([]),
  workspacePanels: z.array(workspacePanelSchema).default([]),
  settingsSections: z.array(settingsSectionSchema).default([]),
  contextActions: z.array(contextActionSchema).default([]),
});
export type ExtensionContributes = z.infer<typeof extensionContributesSchema>;

/** 拡張の種別 */
export const extensionKindSchema = z.enum(["builtin", "external"]);
export type ExtensionKind = z.infer<typeof extensionKindSchema>;

/** 拡張カテゴリ */
export const extensionCategorySchema = z.enum(["Transformer", "DbConnector", "Utility"]);
export type ExtensionCategory = z.infer<typeof extensionCategorySchema>;

/** 統合マニフェスト V2 — builtin と external の両方に対応 */
export const extensionManifestV2Schema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  version: z.string().default("1.0.0"),
  description: z.string().default(""),
  kind: extensionKindSchema,
  category: extensionCategorySchema.default("Utility"),
  api_version: z.number().int().optional(),
  publisher: z.string().optional(),
  entry: z.record(z.string(), z.string()).optional(),
  capabilities: z.array(z.string()).default([]),
  contributes: extensionContributesSchema.default({}),
  inputFormats: z.array(z.string()).default([]),
  outputFormats: z.array(z.string()).default([]),
});
export type ExtensionManifestV2 = z.infer<typeof extensionManifestV2Schema>;

/** フロントエンドで消費する解決済み拡張状態 */
export const resolvedExtensionSchema = z.object({
  manifest: extensionManifestV2Schema,
  enabled: z.boolean(),
  stage: extensionLifecycleStageSchema.nullable().default(null),
  pid: z.number().int().nullable().default(null),
  port: z.number().int().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type ResolvedExtension = z.infer<typeof resolvedExtensionSchema>;
