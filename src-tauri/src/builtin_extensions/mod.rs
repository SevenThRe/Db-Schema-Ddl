// 組み込み拡張機能レジストリ
// アプリケーションに内蔵された拡張機能のマニフェスト定義を管理する

use serde::{Deserialize, Serialize};

/// 組み込み拡張機能のマニフェスト定義
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinExtensionManifest {
    /// 拡張機能の一意識別子
    pub id: String,
    /// 表示名
    pub name: String,
    /// 機能説明
    pub description: String,
    /// 拡張機能カテゴリ
    pub category: ExtensionCategory,
    /// 受け付ける入力フォーマット一覧
    pub input_formats: Vec<String>,
    /// 生成可能な出力フォーマット一覧
    pub output_formats: Vec<String>,
}

/// 拡張機能のカテゴリ分類
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExtensionCategory {
    /// 変換処理（ファイル形式の変換・生成）
    Transformer,
    /// データベース接続・操作
    DbConnector,
}

/// 全組み込み拡張機能のマニフェストを返す
pub fn get_builtin_extensions() -> Vec<BuiltinExtensionManifest> {
    vec![
        BuiltinExtensionManifest {
            id: "excel-to-ddl".to_string(),
            name: "Excel → DDL".to_string(),
            description: "データベース定義書（XLSX）からMySQL/Oracle用DDLを生成する".to_string(),
            category: ExtensionCategory::Transformer,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["sql".to_string(), "zip".to_string()],
        },
        BuiltinExtensionManifest {
            id: "ddl-to-excel".to_string(),
            name: "DDL → Excel".to_string(),
            description: "SQL DDLファイルからデータベース定義書（XLSX）を逆生成する".to_string(),
            category: ExtensionCategory::Transformer,
            input_formats: vec!["sql".to_string()],
            output_formats: vec!["xlsx".to_string()],
        },
        BuiltinExtensionManifest {
            id: "excel-to-java-enum".to_string(),
            name: "Excel → Java Enum".to_string(),
            description: "XLSXの列挙定義シートからJava enumクラスを生成する".to_string(),
            category: ExtensionCategory::Transformer,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["java".to_string()],
        },
        BuiltinExtensionManifest {
            id: "excel-to-ts-enum".to_string(),
            name: "Excel → TypeScript Enum".to_string(),
            description: "XLSXの列挙定義シートからTypeScript const enumを生成する".to_string(),
            category: ExtensionCategory::Transformer,
            input_formats: vec!["xlsx".to_string()],
            output_formats: vec!["ts".to_string()],
        },
    ]
}

/// 列挙定義生成サブモジュール
pub mod enum_gen;
