// 組み込み拡張機能レジストリ
// アプリケーションに内蔵された拡張機能のマニフェスト定義を管理する
// V2: Contribution モデル対応 — ナビゲーション・ワークスペース・設定・コンテキストアクション

use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────────
// Contribution サブ構造体
// ──────────────────────────────────────────────

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

/// 拡張が宣言する Contribution（貢献）の集合
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionContributes {
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
    pub input_formats: Vec<String>,
    pub output_formats: Vec<String>,
    pub contributes: ExtensionContributes,
}

// Phase 4: built-in feature (DDL 生成器, DDL 導入, Schema Diff) はナビゲーションを宣言しない。
// 外部拡張 (db-connector) のみがナビゲーションを contribution として宣言する。
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
            id: "db-connector".to_string(),
            name: "DB 工作台".to_string(),
            version: "1.0.0".to_string(),
            description: "SQL 编写・执行・结果浏览・执行计划・危険 SQL 保護".to_string(),
            kind: "builtin".to_string(),
            category: ExtensionCategory::DbConnector,
            capabilities: vec![
                "db.connect".to_string(),
                "db.query".to_string(),
                "db.schema.read".to_string(),
                "db.plan.read".to_string(),
                "db.result.export".to_string(),
            ],
            input_formats: vec!["mysql".to_string(), "postgres".to_string()],
            output_formats: vec!["diff".to_string(), "xlsx".to_string()],
            contributes: ExtensionContributes {
                navigation: vec![NavigationItem {
                    id: "db-connector".to_string(),
                    label: "数据库".to_string(),
                    icon: Some("Database".to_string()),
                    order: 10,
                }],
                workspace_panels: vec![WorkspacePanel {
                    id: "db-connector-workspace".to_string(),
                    title: "数据库工作台".to_string(),
                    component: Some("DbConnectorWorkspace".to_string()),
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
