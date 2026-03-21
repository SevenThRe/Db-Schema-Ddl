/**
 * SQLトークナイザ
 *
 * SchemaDiffPanel.tsxから移植したSQL構文解析ロジック。
 * DDL差分ビューアのシンタックスハイライトに使用する。
 */

export type SqlTokenType = "plain" | "keyword" | "type" | "identifier" | "string" | "comment" | "number" | "operator";

export interface SqlToken {
  text: string;
  type: SqlTokenType;
}

/** SQL予約語セット */
const SQL_KEYWORDS = new Set([
  "ADD", "ALTER", "AND", "AS", "AUTO_INCREMENT", "BY", "CASCADE", "CHARACTER",
  "CHECK", "COLLATE", "COMMENT", "CONSTRAINT", "CREATE", "CURRENT_DATE",
  "CURRENT_TIME", "CURRENT_TIMESTAMP", "DATABASE", "DEFAULT", "DELETE", "DESC",
  "DROP", "ENGINE", "EXISTS", "FOREIGN", "FROM", "GENERATED", "IF", "IN",
  "INDEX", "INSERT", "INTO", "IS", "KEY", "NOT", "NULL", "ON", "OR", "ORDER",
  "PRIMARY", "REFERENCES", "SET", "TABLE", "TO", "TRIGGER", "UNIQUE", "UPDATE",
  "USING", "VALUES", "VIEW", "WHERE",
]);

/** SQLデータ型名セット */
const SQL_TYPE_NAMES = new Set([
  "BIGINT", "BINARY", "BIT", "BLOB", "BOOLEAN", "CHAR", "CLOB", "DATE",
  "DATETIME", "DECIMAL", "DOUBLE", "FLOAT", "INT", "INTEGER", "JSON",
  "LONGTEXT", "MEDIUMINT", "MEDIUMTEXT", "NCHAR", "NCLOB", "NUMBER", "NUMERIC",
  "NVARCHAR", "NVARCHAR2", "REAL", "SERIAL", "SMALLINT", "TEXT", "TIME",
  "TIMESTAMP", "TINYINT", "UUID", "VARCHAR", "VARCHAR2",
]);

/**
 * ライトモード用トークンカラーマッピング
 * dark:プレフィックスでダークモード対応
 */
export const SQL_TOKEN_LIGHT_CLASSES: Record<SqlTokenType, string> = {
  plain: "text-slate-800 dark:text-slate-200",
  keyword: "text-purple-700 dark:text-cyan-300 font-semibold",
  type: "text-blue-700 dark:text-sky-300",
  identifier: "text-amber-700 dark:text-amber-300",
  string: "text-green-700 dark:text-emerald-300",
  comment: "text-slate-400 dark:text-slate-500 italic",
  number: "text-orange-600 dark:text-violet-300",
  operator: "text-slate-600 dark:text-slate-300",
};

/** ダークモード専用トークンカラー（コードブロック背景がダーク固定の場合に使用） */
export const SQL_TOKEN_DARK_CLASSES: Record<SqlTokenType, string> = {
  plain: "text-slate-200",
  keyword: "text-cyan-300 font-semibold",
  type: "text-sky-300",
  identifier: "text-amber-300",
  string: "text-emerald-300",
  comment: "text-slate-400 italic",
  number: "text-violet-300",
  operator: "text-slate-300",
};

/** 単語をSQL分類する */
function classifySqlWord(word: string): SqlTokenType {
  const upper = word.toUpperCase();
  if (SQL_KEYWORDS.has(upper)) return "keyword";
  if (SQL_TYPE_NAMES.has(upper)) return "type";
  return "plain";
}

/**
 * SQL文字列をトークン配列に分割する
 *
 * キーワード、型名、識別子、文字列リテラル、コメント、数値、演算子を識別する。
 */
export function tokenizeSql(sqlText: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const length = sqlText.length;
  let index = 0;

  const isWordStart = (ch: string) => /[A-Za-z_]/.test(ch);
  const isWordPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (index < length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    // 単行コメント: --
    if (current === "-" && next === "-") {
      let end = index + 2;
      while (end < length && sqlText[end] !== "\n") end += 1;
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

    // ブロックコメント: /* ... */
    if (current === "/" && next === "*") {
      let end = index + 2;
      while (end < length - 1 && !(sqlText[end] === "*" && sqlText[end + 1] === "/")) end += 1;
      end = end < length - 1 ? end + 2 : length;
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

    // 文字列リテラルと識別子
    if (current === "'" || current === '"' || current === "`") {
      const quote = current;
      let end = index + 1;
      while (end < length) {
        const char = sqlText[end];
        if (char === quote) {
          if (quote === "'" && sqlText[end + 1] === "'") {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        if (char === "\\" && quote !== "'" && end + 1 < length) {
          end += 2;
          continue;
        }
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: quote === "`" ? "identifier" : "string" });
      index = end;
      continue;
    }

    // 空白
    if (/\s/.test(current)) {
      let end = index + 1;
      while (end < length && /\s/.test(sqlText[end])) end += 1;
      tokens.push({ text: sqlText.slice(index, end), type: "plain" });
      index = end;
      continue;
    }

    // 数値
    if (isDigit(current)) {
      let end = index + 1;
      while (end < length && /[0-9._]/.test(sqlText[end])) end += 1;
      tokens.push({ text: sqlText.slice(index, end), type: "number" });
      index = end;
      continue;
    }

    // 単語（キーワード、型名、識別子）
    if (isWordStart(current)) {
      let end = index + 1;
      while (end < length && isWordPart(sqlText[end])) end += 1;
      const word = sqlText.slice(index, end);
      tokens.push({ text: word, type: classifySqlWord(word) });
      index = end;
      continue;
    }

    // 演算子・記号
    tokens.push({ text: current, type: "operator" });
    index += 1;
  }

  return tokens;
}
