// 組み込み拡張機能レジストリ
// アプリケーションに内蔵された拡張機能のマニフェスト定義を管理する
// V2: Contribution モデル対応 — アクティビティバー・サイドバー・ワークベンチ・設定・コンテキストアクション

use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────────
// Contribution サブ構造体
// ──────────────────────────────────────────────

/// 拡張シェルのアクティビティバー項目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBarItem {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default = "default_order")]
    pub order: u32,
    pub default_sidebar_view_id: String,
    pub default_workbench_view_id: String,
}

/// 拡張が提供するセカンダリサイドバー項目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarView {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_item_id: Option<String>,
    #[serde(default = "default_order")]
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_view_id: Option<String>,
}

/// 拡張が提供するメインワークベンチビュー
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchView {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_view_id: Option<String>,
}

/// 外部拡張が提供するフロントエンド UI バンドル定義
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiBundle {
    pub entry: String,
    #[serde(default = "default_ui_bundle_mode")]
    pub mode: String,
    #[serde(default = "default_ui_bundle_api_version")]
    pub api_version: u32,
}

/// サイドバーまたはヘッダーに表示するナビゲーションエントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationItem {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default = "default_order")]
    pub order: u32,
}

/// 拡張が提供するワークスペースパネル
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePanel {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
}

/// 設定ページに表示するセクション
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSection {
    pub id: String,
    pub label: String,
    #[serde(default = "default_order")]
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
}

/// コンテキストメニューやアクションバーに表示するアクション
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextAction {
    pub id: String,
    pub label: String,
    pub context: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

fn default_order() -> u32 {
    100
}

fn default_ui_bundle_mode() -> String {
    "iframe".to_string()
}

fn default_ui_bundle_api_version() -> u32 {
    1
}

/// 拡張が宣言する Contribution（貢献）の集合
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionContributes {
    #[serde(default)]
    pub activity_bar: Vec<ActivityBarItem>,
    #[serde(default)]
    pub sidebar_views: Vec<SidebarView>,
    #[serde(default)]
    pub workbench_views: Vec<WorkbenchView>,
    #[serde(default)]
    pub navigation: Vec<NavigationItem>,
    #[serde(default)]
    pub workspace_panels: Vec<WorkspacePanel>,
    #[serde(default)]
    pub settings_sections: Vec<SettingsSection>,
    #[serde(default)]
    pub context_actions: Vec<ContextAction>,
}

// ──────────────────────────────────────────────
// 拡張カテゴリ
// ──────────────────────────────────────────────

/// 拡張機能のカテゴリ分類
/// serde デフォルト（PascalCase）で TS 側の "Transformer" | "DbConnector" | "Utility" と一致させる
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExtensionCategory {
    Transformer,
    DbConnector,
    Utility,
}

// ──────────────────────────────────────────────
// 組み込み拡張マニフェスト V2
// ──────────────────────────────────────────────

/// 組み込み拡張機能のマニフェスト定義（V2: Contribution 対応）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinExtensionManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub kind: String,
    pub category: ExtensionCategory,
    /// 要求する Capability 一覧（db.connect, db.schema.read 等）
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_bundle: Option<UiBundle>,
    pub input_formats: Vec<String>,
    pub output_formats: Vec<String>,
    pub contributes: ExtensionContributes,
}

// built-in feature (DDL 生成器, DDL 導入, Schema Diff) はナビゲーションを宣言しない。
// installable extension のみが activity / sidebar / workbench を宣言する。
// built-in 定義自体は旧 navigation / workspace_panels の互換入力を維持する。
/// 全組み込み拡張機能のマニフェストを返す
pub fn get_builtin_extensions() -> Vec<BuiltinExtensionManifest> {
    vec![
        // excel-to-ddl はアプリ本体の主機能のため拡張として列挙しない
        BuiltinExtensionManifest {
            id: "ddl-to-excel".to_string(),
            name: "DDL → Excel".to_string(),
            version: "1.0.0".to_string(),
            description: "从 SQL DDL 文件逆向生成数据库定义书（XLSX）".to_string(),
            kind: "builtin".to_string(),
            category: ExtensionCategory::Transformer,
            capabilities: vec![],
            ui_bundle: None,
            input_formats: vec!["sql".to_string()],
            output_formats: vec!["xlsx".to_string()],
            contributes: ExtensionContributes {
                navigation: vec![],
                workspace_panels: vec![WorkspacePanel {
                    id: "ddl-to-excel-workspace".to_string(),
                    title: "DDL → Excel".to_string(),
                    component: Some("DdlToExcelWorkspace".to_string()),
                }],
                ..Default::default()
            },
        },
        BuiltinExtensionManifest {
            id: "excel-to-java-enum".to_string(),
            name: "Excel → Java Enum".to_string(),
            version: "1.0.0".to_string(),
            description: "从 XLSX 枚举定义表生成 Java enum 类".to_string(),
            kind: "builtin".to_string(),
            category: ExtensionCategory::Transformer,
            capabilities: vec![],
            ui_bundle: None,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["java".to_string()],
            contributes: ExtensionContributes {
                navigation: vec![],
                workspace_panels: vec![WorkspacePanel {
                    id: "enum-gen-workspace".to_string(),
                    title: "Enum 生成".to_string(),
                    component: Some("EnumGenWorkspace".to_string()),
                }],
                ..Default::default()
            },
        },
        BuiltinExtensionManifest {
            id: "excel-to-ts-enum".to_string(),
            name: "Excel → TypeScript Enum".to_string(),
            version: "1.0.0".to_string(),
            description: "从 XLSX 枚举定义表生成 TypeScript const enum".to_string(),
            kind: "builtin".to_string(),
            category: ExtensionCategory::Transformer,
            capabilities: vec![],
            ui_bundle: None,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["ts".to_string()],
            contributes: ExtensionContributes {
                workspace_panels: vec![WorkspacePanel {
                    id: "enum-gen-workspace".to_string(),
                    title: "Enum 生成".to_string(),
                    component: Some("EnumGenWorkspace".to_string()),
                }],
                ..Default::default()
            },
        },
        BuiltinExtensionManifest {
            id: "schema-diff".to_string(),
            name: "Schema Diff".to_string(),
            version: "1.0.0".to_string(),
            description: "Excel 定义书的多版本 Schema 差分比较与 ALTER 生成".to_string(),
            kind: "builtin".to_string(),
            category: ExtensionCategory::Transformer,
            capabilities: vec![],
            ui_bundle: None,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["sql".to_string()],
            contributes: ExtensionContributes {
                navigation: vec![],
                workspace_panels: vec![WorkspacePanel {
                    id: "schema-diff-workspace".to_string(),
                    title: "Schema Diff".to_string(),
                    component: Some("SchemaDiffPanel".to_string()),
                }],
                ..Default::default()
            },
        },
    ]
}

/// 列挙定義生成サブモジュール
pub mod enum_gen;
