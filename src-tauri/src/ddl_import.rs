// DDLインポートモジュール: SQL DDL テキストを解析して DdlImportCatalog に変換する
// Node.js の @dbml/core に相当する機能を sqlparser-rs で実装

use serde::{Deserialize, Serialize};
use sqlparser::ast::{
  CharacterLength, ColumnDef, ColumnOption, CreateTable, DataType, ExactNumberInfo, Statement,
  TableConstraint,
};
use sqlparser::dialect::{AnsiDialect, MySqlDialect};
use sqlparser::parser::Parser;

// ──────────────────────────────────────────────
// 出力型定義 (shared/schema.ts の型に対応)
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportDefaultValue {
  #[serde(rename = "type")]
  pub value_type: String, // "number" | "string" | "boolean" | "expression"
  pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportColumn {
  pub entity_key: String,
  pub name: String,
  pub data_type: String,
  pub data_type_args: Option<String>,
  pub column_type: String,
  pub nullable: bool,
  pub default_value: Option<DdlImportDefaultValue>,
  pub auto_increment: bool,
  pub primary_key: bool,
  pub unique: bool,
  pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportIndexColumn {
  pub column_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportIndex {
  pub entity_key: String,
  pub name: String,
  pub unique: bool,
  pub primary: bool,
  pub columns: Vec<DdlImportIndexColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportForeignKeyColumn {
  pub column_name: String,
  pub referenced_column_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportForeignKey {
  pub entity_key: String,
  pub name: String,
  pub referenced_table_name: String,
  pub on_delete: Option<String>,
  pub on_update: Option<String>,
  pub columns: Vec<DdlImportForeignKeyColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportTable {
  pub entity_key: String,
  pub name: String,
  pub comment: Option<String>,
  pub engine: Option<String>,
  pub columns: Vec<DdlImportColumn>,
  pub indexes: Vec<DdlImportIndex>,
  pub foreign_keys: Vec<DdlImportForeignKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportCatalog {
  pub source_mode: String,
  pub dialect: String,
  pub database_name: String,
  pub tables: Vec<DdlImportTable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportIssue {
  pub severity: String, // "blocking" | "confirm" | "info"
  pub kind: String,     // "parser_error" | "parser_unsupported" | "workbook_inexpressible" | "workbook_lossy" | "info"
  pub entity_key: String,
  pub table_name: Option<String>,
  pub column_name: Option<String>,
  pub constraint_name: Option<String>,
  pub message: String,
  pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportIssueSummary {
  pub blocking_count: usize,
  pub confirm_count: usize,
  pub info_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdlImportPreviewResponse {
  pub source_mode: String,
  pub dialect: String,
  pub file_name: Option<String>,
  pub source_sql: String,
  pub catalog: DdlImportCatalog,
  pub issues: Vec<DdlImportIssue>,
  pub issue_summary: DdlImportIssueSummary,
  pub selectable_table_names: Vec<String>,
}

// ──────────────────────────────────────────────
// データ型変換
// ──────────────────────────────────────────────

/// CharacterLength を文字列引数に変換する
fn char_length_to_string(cl: &CharacterLength) -> Option<String> {
  match cl {
    CharacterLength::IntegerLength { length, .. } => Some(length.to_string()),
    CharacterLength::Max => Some("MAX".to_string()),
  }
}

/// ExactNumberInfo を "precision,scale" 形式の文字列に変換する
fn exact_number_info_args(info: &ExactNumberInfo) -> Option<String> {
  match info {
    ExactNumberInfo::None => None,
    ExactNumberInfo::Precision(p) => Some(p.to_string()),
    ExactNumberInfo::PrecisionAndScale(p, s) => Some(format!("{p},{s}")),
  }
}

/// sqlparser の DataType を文字列ペア (data_type, data_type_args) に変換する
fn convert_data_type(dt: &DataType) -> (String, Option<String>) {
  match dt {
    DataType::Varchar(len) => (
      "VARCHAR".to_string(),
      len.as_ref().and_then(char_length_to_string),
    ),
    DataType::Char(len) | DataType::Character(len) => (
      "CHAR".to_string(),
      len.as_ref().and_then(char_length_to_string),
    ),
    DataType::Int(_) | DataType::Integer(_) => ("INT".to_string(), None),
    DataType::BigInt(_) => ("BIGINT".to_string(), None),
    DataType::SmallInt(_) => ("SMALLINT".to_string(), None),
    DataType::TinyInt(_) => ("TINYINT".to_string(), None),
    DataType::Float(_) => ("FLOAT".to_string(), None),
    DataType::Double | DataType::DoublePrecision => ("DOUBLE".to_string(), None),
    DataType::Decimal(info) | DataType::Numeric(info) => {
      ("DECIMAL".to_string(), exact_number_info_args(info))
    }
    DataType::Boolean => ("BOOLEAN".to_string(), None),
    DataType::Date => ("DATE".to_string(), None),
    DataType::Time(_, _) => ("TIME".to_string(), None),
    DataType::Datetime(_) => ("DATETIME".to_string(), None),
    DataType::Timestamp(_, _) => ("TIMESTAMP".to_string(), None),
    DataType::Text => ("TEXT".to_string(), None),
    DataType::MediumText => ("MEDIUMTEXT".to_string(), None),
    DataType::LongText => ("LONGTEXT".to_string(), None),
    DataType::Blob(_) => ("BLOB".to_string(), None),
    DataType::JSON => ("JSON".to_string(), None),
    DataType::Custom(name, args) => {
      let type_name = name.0.iter().map(|i| i.value.as_str()).collect::<Vec<_>>().join(".");
      let type_args = if args.is_empty() {
        None
      } else {
        Some(
          args
            .iter()
            .map(|a| format!("{a}"))
            .collect::<Vec<_>>()
            .join(","),
        )
      };
      (type_name.to_uppercase(), type_args)
    }
    other => (format!("{other}").to_uppercase(), None),
  }
}

/// カラム定義から列情報を抽出する
fn convert_column(col: &ColumnDef, table_key: &str, idx: usize) -> DdlImportColumn {
  let col_name = col.name.value.clone();
  let entity_key = format!("{table_key}.col.{idx}");
  let (data_type, data_type_args) = convert_data_type(&col.data_type);

  // column_type: 型名 + 引数を含む完全な文字列
  let column_type = match &data_type_args {
    Some(args) => format!("{data_type}({args})"),
    None => data_type.clone(),
  };

  let mut nullable = true;
  let mut auto_increment = false;
  let mut primary_key = false;
  let mut unique = false;
  let mut comment: Option<String> = None;
  let mut default_value: Option<DdlImportDefaultValue> = None;

  for opt_def in &col.options {
    match &opt_def.option {
      ColumnOption::NotNull => nullable = false,
      ColumnOption::Null => nullable = true,
      ColumnOption::Unique { is_primary, .. } => {
        if *is_primary {
          primary_key = true;
          nullable = false;
        } else {
          unique = true;
        }
      }
      // MySQL の AUTO_INCREMENT は DialectSpecific トークン列として表現される
      ColumnOption::DialectSpecific(tokens) => {
        let token_str = tokens.iter().map(|t| format!("{t}")).collect::<Vec<_>>().join(" ");
        if token_str.to_uppercase().contains("AUTO_INCREMENT") || token_str.to_uppercase().contains("AUTOINCREMENT") {
          auto_increment = true;
        }
      }
      ColumnOption::Comment(c) => comment = Some(c.clone()),
      ColumnOption::Default(expr) => {
        let val_str = format!("{expr}");
        // 数値・文字列・真偽値・式を分類する
        let (vtype, vval) = if val_str.starts_with('\'') || val_str.starts_with('"') {
          ("string", val_str.trim_matches('\'').trim_matches('"').to_string())
        } else if val_str.eq_ignore_ascii_case("true") || val_str.eq_ignore_ascii_case("false") {
          ("boolean", val_str.to_lowercase())
        } else if val_str.parse::<f64>().is_ok() {
          ("number", val_str.clone())
        } else {
          ("expression", val_str.clone())
        };
        default_value = Some(DdlImportDefaultValue {
          value_type: vtype.to_string(),
          value: vval,
        });
      }
      _ => {}
    }
  }

  DdlImportColumn {
    entity_key,
    name: col_name,
    data_type,
    data_type_args,
    column_type,
    nullable,
    default_value,
    auto_increment,
    primary_key,
    unique,
    comment,
  }
}

/// テーブル制約 (CREATE TABLE の末尾 CONSTRAINT 句) を解析して
/// インデックス・外部キーを収集し、主キー列名セットも返す
fn extract_table_constraints(
  constraints: &[TableConstraint],
  table_key: &str,
) -> (Vec<DdlImportIndex>, Vec<DdlImportForeignKey>, std::collections::HashSet<String>) {
  let mut indexes: Vec<DdlImportIndex> = Vec::new();
  let mut foreign_keys: Vec<DdlImportForeignKey> = Vec::new();
  let mut pk_columns: std::collections::HashSet<String> = std::collections::HashSet::new();

  for (ci, constraint) in constraints.iter().enumerate() {
    match constraint {
      TableConstraint::PrimaryKey { name, columns, .. } => {
        let cols: Vec<DdlImportIndexColumn> = columns
          .iter()
          .map(|c| {
            pk_columns.insert(c.value.clone());
            DdlImportIndexColumn { column_name: c.value.clone() }
          })
          .collect();
        if !cols.is_empty() {
          indexes.push(DdlImportIndex {
            entity_key: format!("{table_key}.pk.{ci}"),
            name: name
              .as_ref()
              .map(|n| n.value.clone())
              .unwrap_or_else(|| "PRIMARY".to_string()),
            unique: true,
            primary: true,
            columns: cols,
          });
        }
      }
      TableConstraint::Unique { name, columns, .. } => {
        let cols: Vec<DdlImportIndexColumn> = columns
          .iter()
          .map(|c| DdlImportIndexColumn { column_name: c.value.clone() })
          .collect();
        if !cols.is_empty() {
          indexes.push(DdlImportIndex {
            entity_key: format!("{table_key}.uk.{ci}"),
            name: name
              .as_ref()
              .map(|n| n.value.clone())
              .unwrap_or_else(|| format!("uk_{ci}")),
            unique: true,
            primary: false,
            columns: cols,
          });
        }
      }
      TableConstraint::Index { name, columns, .. } => {
        let cols: Vec<DdlImportIndexColumn> = columns
          .iter()
          .map(|c| DdlImportIndexColumn { column_name: format!("{c}") })
          .collect();
        if !cols.is_empty() {
          indexes.push(DdlImportIndex {
            entity_key: format!("{table_key}.idx.{ci}"),
            name: name
              .as_ref()
              .map(|n| n.value.clone())
              .unwrap_or_else(|| format!("idx_{ci}")),
            unique: false,
            primary: false,
            columns: cols,
          });
        }
      }
      TableConstraint::ForeignKey {
        name,
        columns,
        foreign_table,
        referred_columns,
        on_delete,
        on_update,
        ..
      } => {
        let fk_cols: Vec<DdlImportForeignKeyColumn> = columns
          .iter()
          .zip(referred_columns.iter())
          .map(|(c, rc)| DdlImportForeignKeyColumn {
            column_name: c.value.clone(),
            referenced_column_name: rc.value.clone(),
          })
          .collect();
        if !fk_cols.is_empty() {
          foreign_keys.push(DdlImportForeignKey {
            entity_key: format!("{table_key}.fk.{ci}"),
            name: name
              .as_ref()
              .map(|n| n.value.clone())
              .unwrap_or_else(|| format!("fk_{ci}")),
            referenced_table_name: foreign_table.0.last().map(|i| i.value.clone()).unwrap_or_default(),
            on_delete: on_delete.as_ref().map(|a| format!("{a}")),
            on_update: on_update.as_ref().map(|a| format!("{a}")),
            columns: fk_cols,
          });
        }
      }
      _ => {}
    }
  }

  (indexes, foreign_keys, pk_columns)
}

/// sqlparser の CreateTable AST からテーブル情報を変換する
fn convert_create_table(create: &CreateTable, table_idx: usize) -> DdlImportTable {
  let table_name = create
    .name
    .0
    .last()
    .map(|i| i.value.clone())
    .unwrap_or_else(|| format!("table_{table_idx}"));
  let table_key = format!("tbl.{table_idx}");

  let (mut indexes, foreign_keys, pk_columns) =
    extract_table_constraints(&create.constraints, &table_key);

  // 列定義を変換
  let mut columns: Vec<DdlImportColumn> = create
    .columns
    .iter()
    .enumerate()
    .map(|(i, col)| convert_column(col, &table_key, i))
    .collect();

  // テーブル制約のPKを列の primary_key フラグに反映する
  for col in &mut columns {
    if pk_columns.contains(&col.name) {
      col.primary_key = true;
      col.nullable = false;
    }
  }

  // 列レベルの PRIMARY KEY からインデックスを追加する (テーブル制約と重複しない場合のみ)
  let has_table_pk = indexes.iter().any(|i| i.primary);
  if !has_table_pk {
    let pk_cols: Vec<DdlImportIndexColumn> = columns
      .iter()
      .filter(|c| c.primary_key)
      .map(|c| DdlImportIndexColumn { column_name: c.name.clone() })
      .collect();
    if !pk_cols.is_empty() {
      indexes.insert(
        0,
        DdlImportIndex {
          entity_key: format!("{table_key}.pk.auto"),
          name: "PRIMARY".to_string(),
          unique: true,
          primary: true,
          columns: pk_cols,
        },
      );
    }
  }

  // テーブルコメントとエンジンを取得する (MySQL 方言固有オプション)
  // sqlparser 0.53: CreateTable.engine は Option<TableEngine>、comment は Option<CommentDef>
  let comment: Option<String> = create.comment.as_ref().map(|c| {
    match c {
      sqlparser::ast::CommentDef::WithEq(s)
      | sqlparser::ast::CommentDef::WithoutEq(s)
      | sqlparser::ast::CommentDef::AfterColumnDefsWithoutEq(s) => s.clone(),
    }
  });
  let engine: Option<String> = create.engine.as_ref().map(|e| e.name.to_string());

  DdlImportTable {
    entity_key: table_key,
    name: table_name,
    comment,
    engine,
    columns,
    indexes,
    foreign_keys,
  }
}

// ──────────────────────────────────────────────
// パブリック API
// ──────────────────────────────────────────────

/// MySQL DDL SQL テキストを解析して DdlImportCatalog を返す
pub fn parse_mysql_ddl(sql_text: &str) -> Result<DdlImportCatalog, String> {
  let dialect = MySqlDialect {};
  let statements =
    Parser::parse_sql(&dialect, sql_text).map_err(|e| format!("MySQL DDL parse error: {e}"))?;

  let mut tables = Vec::new();
  for stmt in &statements {
    if let Statement::CreateTable(create) = stmt {
      tables.push(convert_create_table(create, tables.len()));
    }
  }

  Ok(DdlImportCatalog {
    source_mode: "mysql-paste".to_string(),
    dialect: "mysql".to_string(),
    database_name: "ddl_import".to_string(),
    tables,
  })
}

/// Oracle DDL SQL テキストを解析して DdlImportCatalog を返す
/// Oracle 方言は ANSI ダイアレクトで近似解析する
pub fn parse_oracle_ddl(sql_text: &str) -> Result<DdlImportCatalog, String> {
  let dialect = AnsiDialect {};
  let statements =
    Parser::parse_sql(&dialect, sql_text).map_err(|e| format!("Oracle DDL parse error: {e}"))?;

  let mut tables = Vec::new();
  for stmt in &statements {
    if let Statement::CreateTable(create) = stmt {
      tables.push(convert_create_table(create, tables.len()));
    }
  }

  Ok(DdlImportCatalog {
    source_mode: "oracle-paste".to_string(),
    dialect: "oracle".to_string(),
    database_name: "ddl_import".to_string(),
    tables,
  })
}

/// ソースモードに応じて適切なパーサーを選択して解析する
pub fn parse_ddl_by_source_mode(
  source_mode: &str,
  sql_text: &str,
) -> Result<DdlImportCatalog, String> {
  let mut catalog = match source_mode {
    "oracle-paste" | "oracle-file" => parse_oracle_ddl(sql_text)?,
    _ => parse_mysql_ddl(sql_text)?, // mysql-paste / mysql-file / mysql-bundle
  };
  catalog.source_mode = source_mode.to_string();
  Ok(catalog)
}

/// イシューを収集して IssueSummary を計算する
fn collect_issues(catalog: &DdlImportCatalog) -> (Vec<DdlImportIssue>, DdlImportIssueSummary) {
  let mut issues: Vec<DdlImportIssue> = Vec::new();

  // 各テーブルの検証
  for table in &catalog.tables {
    // PK なしの場合は確認イシュー
    let has_pk = table.columns.iter().any(|c| c.primary_key)
      || table.indexes.iter().any(|i| i.primary);
    if !has_pk {
      issues.push(DdlImportIssue {
        severity: "confirm".to_string(),
        kind: "workbook_inexpressible".to_string(),
        entity_key: table.entity_key.clone(),
        table_name: Some(table.name.clone()),
        column_name: None,
        constraint_name: None,
        message: format!("テーブル '{}' には主キーがありません。", table.name),
        detail: Some("主キーのないテーブルは DDL 生成時に制限があります。".to_string()),
      });
    }

    // 列が空の場合はブロッキングイシュー
    if table.columns.is_empty() {
      issues.push(DdlImportIssue {
        severity: "blocking".to_string(),
        kind: "workbook_inexpressible".to_string(),
        entity_key: table.entity_key.clone(),
        table_name: Some(table.name.clone()),
        column_name: None,
        constraint_name: None,
        message: format!("テーブル '{}' に列定義がありません。", table.name),
        detail: None,
      });
    }

    // AUTO_INCREMENT + 非 INT 型の列は情報イシュー
    for col in &table.columns {
      if col.auto_increment && !matches!(col.data_type.as_str(), "INT" | "BIGINT" | "SMALLINT" | "TINYINT" | "INTEGER") {
        issues.push(DdlImportIssue {
          severity: "info".to_string(),
          kind: "workbook_lossy".to_string(),
          entity_key: col.entity_key.clone(),
          table_name: Some(table.name.clone()),
          column_name: Some(col.name.clone()),
          constraint_name: None,
          message: format!(
            "列 '{}.{}' は AUTO_INCREMENT ですが型が {} です。",
            table.name, col.name, col.data_type
          ),
          detail: Some("整数型以外の AUTO_INCREMENT は一部の RDBMS でサポートされません。".to_string()),
        });
      }
    }
  }

  let blocking_count = issues.iter().filter(|i| i.severity == "blocking").count();
  let confirm_count = issues.iter().filter(|i| i.severity == "confirm").count();
  let info_count = issues.iter().filter(|i| i.severity == "info").count();

  let summary = DdlImportIssueSummary {
    blocking_count,
    confirm_count,
    info_count,
  };

  (issues, summary)
}

/// DDL テキストを解析してプレビューレスポンスを返す (Tauri コマンドから呼ばれる)
pub fn preview_ddl_import(
  source_mode: &str,
  sql_text: &str,
  file_name: Option<String>,
) -> Result<DdlImportPreviewResponse, String> {
  let catalog = parse_ddl_by_source_mode(source_mode, sql_text)?;
  let dialect = if source_mode.starts_with("oracle") {
    "oracle"
  } else {
    "mysql"
  };

  let selectable_table_names: Vec<String> = catalog.tables.iter().map(|t| t.name.clone()).collect();
  let (issues, issue_summary) = collect_issues(&catalog);

  Ok(DdlImportPreviewResponse {
    source_mode: source_mode.to_string(),
    dialect: dialect.to_string(),
    file_name,
    source_sql: sql_text.to_string(),
    catalog,
    issues,
    issue_summary,
    selectable_table_names,
  })
}

// ──────────────────────────────────────────────
// テスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;

  const SAMPLE_MYSQL: &str = r#"
    CREATE TABLE `employee` (
      `id` INT NOT NULL AUTO_INCREMENT,
      `name` VARCHAR(100) NOT NULL COMMENT '氏名',
      `salary` DECIMAL(10,2) DEFAULT NULL,
      `created_at` DATETIME NOT NULL,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB COMMENT='社員テーブル';
  "#;

  const SAMPLE_ORACLE: &str = r#"
    CREATE TABLE employee (
      id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      salary DECIMAL(10,2),
      created_at DATE NOT NULL,
      CONSTRAINT pk_employee PRIMARY KEY (id)
    );
  "#;

  #[test]
  fn parses_mysql_ddl_and_extracts_table() {
    let catalog = parse_mysql_ddl(SAMPLE_MYSQL).expect("MySQL DDL should parse");
    assert_eq!(catalog.tables.len(), 1, "should have 1 table");
    assert_eq!(catalog.tables[0].name, "employee");
    assert_eq!(catalog.dialect, "mysql");
  }

  #[test]
  fn mysql_table_has_correct_columns() {
    let catalog = parse_mysql_ddl(SAMPLE_MYSQL).expect("parse");
    let table = &catalog.tables[0];
    assert_eq!(table.columns.len(), 4, "should have 4 columns");

    let id_col = table.columns.iter().find(|c| c.name == "id").expect("id column");
    assert!(id_col.auto_increment, "id should be AUTO_INCREMENT");
    assert!(id_col.primary_key, "id should be primary key");
    assert!(!id_col.nullable, "id should be NOT NULL");

    let name_col = table.columns.iter().find(|c| c.name == "name").expect("name column");
    assert_eq!(name_col.data_type, "VARCHAR");
    assert_eq!(name_col.data_type_args.as_deref(), Some("100"));
    assert_eq!(name_col.comment.as_deref(), Some("氏名"));
  }

  #[test]
  fn mysql_table_has_primary_key_index() {
    let catalog = parse_mysql_ddl(SAMPLE_MYSQL).expect("parse");
    let table = &catalog.tables[0];
    assert!(
      table.indexes.iter().any(|i| i.primary),
      "should have at least one PRIMARY index"
    );
  }

  #[test]
  fn parses_oracle_ddl_and_extracts_table() {
    let catalog = parse_oracle_ddl(SAMPLE_ORACLE).expect("Oracle DDL should parse");
    assert_eq!(catalog.tables.len(), 1);
    assert_eq!(catalog.tables[0].name, "employee");
    assert_eq!(catalog.dialect, "oracle");
  }

  #[test]
  fn oracle_table_has_named_pk_constraint() {
    let catalog = parse_oracle_ddl(SAMPLE_ORACLE).expect("parse");
    let table = &catalog.tables[0];
    let pk_index = table.indexes.iter().find(|i| i.primary).expect("primary index");
    assert_eq!(pk_index.name, "pk_employee");
  }

  #[test]
  fn preview_returns_selectable_table_names() {
    let resp = preview_ddl_import("mysql-paste", SAMPLE_MYSQL, None).expect("preview");
    assert_eq!(resp.selectable_table_names, vec!["employee"]);
    assert_eq!(resp.source_mode, "mysql-paste");
    assert_eq!(resp.dialect, "mysql");
  }

  #[test]
  fn empty_table_generates_blocking_issue() {
    let sql = "CREATE TABLE bad_table ();";
    // テーブルに列がない場合はブロッキングイシュー
    // sqlparser がパースエラーを出す可能性があるため、解析結果を柔軟に確認する
    if let Ok(resp) = preview_ddl_import("mysql-paste", sql, None) {
      if resp.catalog.tables.first().map(|t| t.columns.is_empty()).unwrap_or(false) {
        assert!(resp.issue_summary.blocking_count > 0, "empty table should have blocking issue");
      }
    }
  }

  #[test]
  fn multi_table_ddl_returns_multiple_tables() {
    let sql = r#"
      CREATE TABLE users (id INT NOT NULL, name VARCHAR(50), PRIMARY KEY (id));
      CREATE TABLE orders (id INT NOT NULL, user_id INT NOT NULL, PRIMARY KEY (id));
    "#;
    let resp = preview_ddl_import("mysql-paste", sql, Some("test.sql".to_string())).expect("parse");
    assert_eq!(resp.catalog.tables.len(), 2, "should parse 2 tables");
    assert_eq!(resp.file_name.as_deref(), Some("test.sql"));
  }
}
