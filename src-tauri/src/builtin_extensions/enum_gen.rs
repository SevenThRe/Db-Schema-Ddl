// 列挙定義生成モジュール
// Excel（XLSX）の列挙定義シートを解析し、Java enum / TypeScript const を生成する

use calamine::{open_workbook_auto, Data, Range, Reader};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write as IoWrite;
use zip::{write::FileOptions, ZipWriter};

// ──────────────────────────────────────────────────────────────────────────────
// データ構造定義
// ──────────────────────────────────────────────────────────────────────────────

/// 列挙定数の1エントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumConstant {
    /// 定数名（SCREAMING_SNAKE_CASE に正規化済み）
    pub name: String,
    /// 定数値（文字列として保持）
    pub value: String,
    /// 表示ラベル（任意）
    pub label: Option<String>,
}

/// 1つの列挙クラスを表す
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumClass {
    /// クラス名（PascalCase に正規化済み）
    pub class_name: String,
    /// 定数一覧（Excel 行順を維持）
    pub constants: Vec<EnumConstant>,
}

/// プレビューAPIのレスポンス
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumGenPreviewResponse {
    /// 解析された列挙クラス一覧
    pub enums: Vec<EnumClass>,
    /// 生成されたコード（プレビュー用、TypeScript形式）
    pub code: String,
    /// 解析中に検出した警告メッセージ
    pub warnings: Vec<String>,
    /// 自動検出されたカラム位置情報
    pub detected_columns: DetectedColumns,
}

/// ヘッダー行から自動検出されたカラムインデックス
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedColumns {
    /// クラス名列のインデックス（0始まり）
    pub class_col: usize,
    /// 定数名列のインデックス（0始まり）
    pub name_col: usize,
    /// 値列のインデックス（0始まり）
    pub value_col: usize,
    /// ラベル列のインデックス（検出できなかった場合は None）
    pub label_col: Option<usize>,
    /// ヘッダー行のインデックス（0始まり）
    pub header_row: usize,
}

/// 列挙コード生成リクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumGenRequest {
    /// 対象ファイルの内部 ID
    pub file_id: i64,
    /// 解析対象シート名
    pub sheet_name: String,
    /// 生成言語
    pub target_lang: TargetLang,
    /// Java パッケージ名（Java 生成時のみ使用）
    pub package_name: Option<String>,
    /// 出力ディレクトリプレフィックス（将来拡張用）
    pub output_dir_prefix: Option<String>,
}

/// 生成対象言語
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TargetLang {
    #[serde(rename = "java")]
    Java,
    #[serde(rename = "typescript")]
    TypeScript,
}

// ──────────────────────────────────────────────────────────────────────────────
// ヘッダー行検索ロジック
// ──────────────────────────────────────────────────────────────────────────────

/// calamine の Data セルを文字列に変換するヘルパー
fn cell_to_string(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(s)) => s.trim().to_string(),
        Some(Data::Float(f)) => {
            // 整数として表現できる場合は小数点を除去
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                format!("{f}")
            }
        }
        Some(Data::Int(i)) => i.to_string(),
        Some(Data::Bool(b)) => b.to_string(),
        Some(Data::Empty) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

/// 行内の各セル文字列が指定キーワード群にマッチする列インデックスを返す
fn find_col(row: &[String], keywords: &[&str]) -> Option<usize> {
    row.iter().position(|cell| {
        let lower = cell.to_lowercase();
        keywords.iter().any(|kw| lower == kw.to_lowercase())
    })
}

/// シート全体を走査して列挙定義のヘッダー行を自動検出する
/// 先頭50行を対象とし、クラス名・定数名・値の3列が揃った行をヘッダーと判定する
fn find_header_row(sheet: &Range<Data>) -> Option<DetectedColumns> {
    // クラス名列として認識するキーワード
    let header_keywords_class = [
        "グループ", "クラス", "group", "class", "enum", "枚举",
        "グループ名", "クラス名",
    ];
    // 定数名列として認識するキーワード
    let header_keywords_name = [
        "定数", "constant", "name", "key", "コード", "code", "常量", "定数名",
    ];
    // 値列として認識するキーワード
    let header_keywords_value = ["値", "value", "val", "コード値"];
    // ラベル列として認識するキーワード（任意列）
    let header_keywords_label = ["ラベル", "label", "説明", "description", "名称", "desc"];

    for row_idx in 0..sheet.height().min(50) {
        // 行の全セルを文字列に変換
        let row: Vec<String> = (0..sheet.width())
            .map(|col| cell_to_string(sheet.get((row_idx, col))))
            .collect();

        let class_col = find_col(&row, &header_keywords_class);
        let name_col = find_col(&row, &header_keywords_name);
        let value_col = find_col(&row, &header_keywords_value);

        // 3列すべて検出でき、かつそれぞれ異なる列であることを確認
        if let (Some(cc), Some(nc), Some(vc)) = (class_col, name_col, value_col) {
            if cc != nc && nc != vc && cc != vc {
                // ラベル列は他の列と重複しない場合のみ採用
                let label_col = find_col(&row, &header_keywords_label)
                    .filter(|&lc| lc != cc && lc != nc && lc != vc);
                return Some(DetectedColumns {
                    class_col: cc,
                    name_col: nc,
                    value_col: vc,
                    label_col,
                    header_row: row_idx,
                });
            }
        }
    }
    None
}

// ──────────────────────────────────────────────────────────────────────────────
// 命名規則変換ヘルパー
// ──────────────────────────────────────────────────────────────────────────────

/// 任意の文字列を SCREAMING_SNAKE_CASE に正規化する
/// 英数字以外の文字はアンダースコアに置換し、先頭が数字の場合はアンダースコアを前置する
fn to_constant_name(raw: &str) -> String {
    let normalized: String = raw
        .trim()
        .to_uppercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    // 連続アンダースコアを1つに圧縮
    let mut result = String::new();
    let mut prev_underscore = false;
    for c in normalized.chars() {
        if c == '_' {
            if !prev_underscore && !result.is_empty() {
                result.push(c);
            }
            prev_underscore = true;
        } else {
            result.push(c);
            prev_underscore = false;
        }
    }

    // 末尾のアンダースコアを除去
    let result = result.trim_end_matches('_').to_string();

    // 先頭が数字の場合はアンダースコアを前置
    if result.starts_with(|c: char| c.is_ascii_digit()) {
        format!("_{result}")
    } else if result.is_empty() {
        "UNKNOWN".to_string()
    } else {
        result
    }
}

/// 任意の文字列を PascalCase のクラス名に正規化する
/// 単語の区切り（スペース、アンダースコア等）を検出して大文字化する
fn to_class_name(raw: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = true;

    for c in raw.trim().chars() {
        if c == ' ' || c == '_' || c == '-' || c == '.' {
            // 区切り文字は除去し、次の文字を大文字化
            capitalize_next = true;
        } else if capitalize_next {
            for uc in c.to_uppercase() {
                result.push(uc);
            }
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }

    // 先頭が数字の場合はアンダースコアを前置
    if result.starts_with(|c: char| c.is_ascii_digit()) {
        format!("_{result}")
    } else if result.is_empty() {
        "UnknownEnum".to_string()
    } else {
        result
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Excel 解析メイン処理
// ──────────────────────────────────────────────────────────────────────────────

/// Excel シートを解析して列挙クラス一覧とプレビュー情報を返す
///
/// # 引数
/// * `path` - Excel ファイルのパス
/// * `sheet_name` - 解析対象のシート名
pub fn parse_enum_sheet(
    path: &std::path::Path,
    sheet_name: &str,
) -> Result<EnumGenPreviewResponse, String> {
    // ワークブックを開く（.xlsx / .xls 両対応）
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| format!("Excelファイルを開けませんでした: {e}"))?;

    let sheet = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| format!("シート '{sheet_name}' が見つかりません: {e}"))?;

    // ヘッダー行を自動検出
    let detected = find_header_row(&sheet)
        .ok_or_else(|| "ヘッダー行が見つかりません。グループ/定数/値の列が必要です".to_string())?;

    let mut warnings: Vec<String> = Vec::new();
    // 挿入順序を維持するためにVecで管理（IndexMapの代替）
    let mut class_order: Vec<String> = Vec::new();
    let mut class_map: HashMap<String, Vec<EnumConstant>> = HashMap::new();

    // ヘッダー行の次行からデータを読み込む
    for row_idx in (detected.header_row + 1)..sheet.height() {
        let class_raw = cell_to_string(sheet.get((row_idx, detected.class_col)));
        // クラス名が空の行はスキップ
        if class_raw.is_empty() {
            continue;
        }

        let name_raw = cell_to_string(sheet.get((row_idx, detected.name_col)));
        let value_raw = cell_to_string(sheet.get((row_idx, detected.value_col)));
        let label_raw = detected
            .label_col
            .map(|lc| cell_to_string(sheet.get((row_idx, lc))));

        // 定数名が空の場合は警告を出してスキップ
        if name_raw.is_empty() {
            warnings.push(format!(
                "行 {} のクラス '{}' に定数名がないためスキップしました",
                row_idx + 1,
                class_raw
            ));
            continue;
        }

        let class_name = to_class_name(&class_raw);
        let constant_name = to_constant_name(&name_raw);

        // 定数名の重複チェック（同一クラス内）
        if let Some(existing) = class_map.get(&class_name) {
            if existing.iter().any(|c| c.name == constant_name) {
                warnings.push(format!(
                    "行 {} のクラス '{}' に定数名 '{}' が重複しています",
                    row_idx + 1,
                    class_name,
                    constant_name
                ));
                continue;
            }
        }

        // 挿入順序の管理
        if !class_map.contains_key(&class_name) {
            class_order.push(class_name.clone());
            class_map.insert(class_name.clone(), Vec::new());
        }

        let label = label_raw.filter(|l| !l.is_empty());
        class_map.get_mut(&class_name).unwrap().push(EnumConstant {
            name: constant_name,
            value: value_raw,
            label,
        });
    }

    // 挿入順序を維持した列挙クラス一覧を構築
    let enums: Vec<EnumClass> = class_order
        .into_iter()
        .map(|class_name| {
            let constants = class_map.remove(&class_name).unwrap_or_default();
            EnumClass {
                class_name,
                constants,
            }
        })
        .collect();

    if enums.is_empty() {
        warnings.push("データ行が1件も見つかりませんでした".to_string());
    }

    // プレビュー用コードとして TypeScript 形式を生成
    let code = generate_typescript_content(&enums);

    Ok(EnumGenPreviewResponse {
        enums,
        code,
        warnings,
        detected_columns: detected,
    })
}

// ──────────────────────────────────────────────────────────────────────────────
// Java コード生成
// ──────────────────────────────────────────────────────────────────────────────

/// 1つの EnumClass から Java enum ソースコードを生成する
fn generate_java_class(enum_class: &EnumClass, package_name: &str) -> String {
    let mut lines = Vec::new();

    lines.push(format!("package {package_name};"));
    lines.push(String::new());
    lines.push("/**".to_string());
    lines.push(format!(" * {}", enum_class.class_name));
    lines.push(" * 自動生成コード - 手動編集禁止".to_string());
    lines.push(" */".to_string());
    lines.push(format!("public enum {} {{", enum_class.class_name));
    lines.push(String::new());

    // 定数列を生成（最後の定数のみセミコロン、それ以外はカンマ）
    let count = enum_class.constants.len();
    for (i, constant) in enum_class.constants.iter().enumerate() {
        let label = constant.label.as_deref().unwrap_or("");
        let escaped_label = label.replace('\\', "\\\\").replace('"', "\\\"");
        let escaped_value = constant.value.replace('\\', "\\\\").replace('"', "\\\"");
        let terminator = if i == count - 1 { ";" } else { "," };
        lines.push(format!(
            "    {}(\"{}\", \"{}\"){}",
            constant.name, escaped_value, escaped_label, terminator
        ));
    }

    lines.push(String::new());
    lines.push("    private final String value;".to_string());
    lines.push("    private final String label;".to_string());
    lines.push(String::new());
    lines.push(format!(
        "    {}(String value, String label) {{",
        enum_class.class_name
    ));
    lines.push("        this.value = value;".to_string());
    lines.push("        this.label = label;".to_string());
    lines.push("    }".to_string());
    lines.push(String::new());
    lines.push("    public String getValue() { return value; }".to_string());
    lines.push("    public String getLabel() { return label; }".to_string());
    lines.push(String::new());
    lines.push(format!(
        "    public static {} fromValue(String value) {{",
        enum_class.class_name
    ));
    lines.push(format!(
        "        for ({} e : values()) {{",
        enum_class.class_name
    ));
    lines.push("            if (e.value.equals(value)) return e;".to_string());
    lines.push("        }".to_string());
    lines.push("        throw new IllegalArgumentException(\"Unknown value: \" + value);".to_string());
    lines.push("    }".to_string());
    lines.push("}".to_string());

    lines.join("\n")
}

/// 全列挙クラスを Java ファイルとして ZIP アーカイブに圧縮して返す
///
/// # 引数
/// * `enums` - 列挙クラス一覧
/// * `package_name` - Java パッケージ名（例: "com.example"）
///
/// # 戻り値
/// ZIP ファイルのバイト列
pub fn generate_java_zip(enums: &[EnumClass], package_name: &str) -> Result<Vec<u8>, String> {
    let buf = Vec::new();
    let cursor = std::io::Cursor::new(buf);
    let mut zip = ZipWriter::new(cursor);

    // パッケージ名からディレクトリパスを生成（例: com.example → com/example/）
    let dir_path = package_name.replace('.', "/");

    let options = FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for enum_class in enums {
        let file_path = format!("{}/{}.java", dir_path, enum_class.class_name);
        let java_source = generate_java_class(enum_class, package_name);

        zip.start_file(&file_path, options)
            .map_err(|e| format!("ZIPエントリの作成に失敗しました: {e}"))?;
        zip.write_all(java_source.as_bytes())
            .map_err(|e| format!("ZIPへの書き込みに失敗しました: {e}"))?;
    }

    let result = zip
        .finish()
        .map_err(|e| format!("ZIPの完成に失敗しました: {e}"))?;

    Ok(result.into_inner())
}

// ──────────────────────────────────────────────────────────────────────────────
// TypeScript コード生成
// ──────────────────────────────────────────────────────────────────────────────

/// 全列挙クラスを1つの TypeScript ファイル（enums.ts）として生成する
///
/// # 引数
/// * `enums` - 列挙クラス一覧
///
/// # 戻り値
/// TypeScript ソースコード文字列
pub fn generate_typescript_content(enums: &[EnumClass]) -> String {
    let mut lines = Vec::new();

    lines.push("// 自動生成コード - 手動編集禁止".to_string());
    lines.push(String::new());

    for enum_class in enums {
        // const オブジェクトとして列挙定義を生成
        lines.push(format!("export const {} = {{", enum_class.class_name));

        for constant in &enum_class.constants {
            let escaped_value = constant.value.replace('\\', "\\\\").replace('\'', "\\'");
            let label_str = match &constant.label {
                Some(lbl) => {
                    let escaped_label = lbl.replace('\\', "\\\\").replace('\'', "\\'");
                    format!(", label: '{escaped_label}'")
                }
                None => String::new(),
            };
            lines.push(format!(
                "  {}: {{ value: '{}'{} }},",
                constant.name, escaped_value, label_str
            ));
        }

        lines.push("} as const;".to_string());
        lines.push(String::new());

        // 補助型定義を生成
        lines.push(format!(
            "export type {}Key = keyof typeof {};",
            enum_class.class_name, enum_class.class_name
        ));
        lines.push(format!(
            "export type {}Value = (typeof {})[{}Key];",
            enum_class.class_name, enum_class.class_name, enum_class.class_name
        ));
        lines.push(String::new());
    }

    lines.join("\n")
}
