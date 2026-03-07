import { useEffect, useMemo, useState } from "react";
import {
  useConfirmSchemaDiffRenames,
  useFiles,
  useSchemaDiffAlterExport,
  useSchemaDiffAlterPreview,
  useSchemaDiffHistory,
  useSchemaDiffPreview,
} from "@/hooks/use-ddl";
import type {
  SchemaDiffAlterPreviewResponse,
  SchemaDiffPreviewRequest,
  SchemaDiffPreviewResponse,
} from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { parseUploadedAtMillis } from "@/components/ddl/name-fix-display-utils";
import { translateApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SchemaDiffPanelProps {
  fileId: number | null;
  sheetName: string | null;
}

type RenameDecisionDraft = "pending" | "accept" | "reject";
type ChangeFilter = "all" | "added" | "removed" | "modified" | "renamed";
type ColumnFieldFilter = "all" | "name" | "dataType" | "size" | "nullable" | "pk" | "comment" | "autoIncrement";
type ImpactGroup = "breaking" | "non_breaking" | "metadata";
type DiffSheet = SchemaDiffPreviewResponse["sheets"][number];
type DiffTable = DiffSheet["tableChanges"][number];
type DiffColumn = DiffTable["columnChanges"][number];
type DiffLineKind = "remove" | "add" | "same" | "hint";
type SqlTokenType = "plain" | "keyword" | "type" | "identifier" | "string" | "comment" | "number" | "operator";

interface SqlToken {
  text: string;
  type: SqlTokenType;
}

interface DiffRenderLine {
  prefix: "-" | "+" | "//" | "~";
  kind: DiffLineKind;
  text: string;
  hint?: string;
}

interface DiffTableNode {
  key: string;
  sheetName: string;
  tableChange: DiffTable;
  visibleColumnChanges: DiffColumn[];
  tableName: string;
  tableLabelBefore: string;
  tableLabelAfter: string;
  oldTablePath: string;
  newTablePath: string;
  impactGroup: ImpactGroup;
  columnImpactSummary: {
    schemaCount: number;
    metadataCount: number;
    formattingOnlyCount: number;
  };
}

const SQL_KEYWORDS = new Set([
  "ADD",
  "ALTER",
  "AND",
  "AS",
  "AUTO_INCREMENT",
  "BY",
  "CASCADE",
  "CHARACTER",
  "CHECK",
  "COLLATE",
  "COMMENT",
  "CONSTRAINT",
  "CREATE",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DELETE",
  "DESC",
  "DROP",
  "ENGINE",
  "EXISTS",
  "FOREIGN",
  "FROM",
  "GENERATED",
  "IF",
  "IN",
  "INDEX",
  "INSERT",
  "INTO",
  "IS",
  "KEY",
  "NOT",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "PRIMARY",
  "REFERENCES",
  "SET",
  "TABLE",
  "TO",
  "TRIGGER",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VALUES",
  "VIEW",
  "WHERE",
]);

const SQL_TYPE_NAMES = new Set([
  "BIGINT",
  "BINARY",
  "BIT",
  "BLOB",
  "BOOLEAN",
  "CHAR",
  "CLOB",
  "DATE",
  "DATETIME",
  "DECIMAL",
  "DOUBLE",
  "FLOAT",
  "INT",
  "INTEGER",
  "JSON",
  "LONGTEXT",
  "MEDIUMINT",
  "MEDIUMTEXT",
  "NCHAR",
  "NCLOB",
  "NUMBER",
  "NUMERIC",
  "NVARCHAR",
  "NVARCHAR2",
  "REAL",
  "SERIAL",
  "SMALLINT",
  "TEXT",
  "TIME",
  "TIMESTAMP",
  "TINYINT",
  "UUID",
  "VARCHAR",
  "VARCHAR2",
]);

const SQL_TOKEN_CLASS_MAP: Record<SqlTokenType, string> = {
  plain: "text-slate-200",
  keyword: "text-cyan-300 font-semibold",
  type: "text-sky-300",
  identifier: "text-amber-300",
  string: "text-emerald-300",
  comment: "text-slate-400 italic",
  number: "text-violet-300",
  operator: "text-slate-300",
};

function parseFilenameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // fallback to plain filename
    }
  }

  const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return null;
}

function classifySqlWord(word: string): SqlTokenType {
  const normalizedWord = word.toUpperCase();
  if (SQL_KEYWORDS.has(normalizedWord)) {
    return "keyword";
  }
  if (SQL_TYPE_NAMES.has(normalizedWord)) {
    return "type";
  }
  return "plain";
}

function tokenizeSql(sqlText: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const length = sqlText.length;
  let index = 0;

  const isWordStart = (ch: string) => /[A-Za-z_]/.test(ch);
  const isWordPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (index < length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];

    if (current === "-" && next === "-") {
      let end = index + 2;
      while (end < length && sqlText[end] !== "\n") {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

    if (current === "/" && next === "*") {
      let end = index + 2;
      while (end < length - 1 && !(sqlText[end] === "*" && sqlText[end + 1] === "/")) {
        end += 1;
      }
      end = end < length - 1 ? end + 2 : length;
      tokens.push({ text: sqlText.slice(index, end), type: "comment" });
      index = end;
      continue;
    }

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

    if (/\s/.test(current)) {
      let end = index + 1;
      while (end < length && /\s/.test(sqlText[end])) {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "plain" });
      index = end;
      continue;
    }

    if (isDigit(current)) {
      let end = index + 1;
      while (end < length && /[0-9._]/.test(sqlText[end])) {
        end += 1;
      }
      tokens.push({ text: sqlText.slice(index, end), type: "number" });
      index = end;
      continue;
    }

    if (isWordStart(current)) {
      let end = index + 1;
      while (end < length && isWordPart(sqlText[end])) {
        end += 1;
      }
      const word = sqlText.slice(index, end);
      tokens.push({ text: word, type: classifySqlWord(word) });
      index = end;
      continue;
    }

    tokens.push({ text: current, type: "operator" });
    index += 1;
  }

  return tokens;
}

function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function formatCandidateUploadedAt(uploadedAt?: string): string {
  const millis = parseUploadedAtMillis(uploadedAt);
  if (!Number.isFinite(millis) || millis <= 0) {
    return "n/a";
  }
  return new Date(millis).toLocaleString();
}

function toChangeBucket(action: string): Exclude<ChangeFilter, "all"> {
  if (action === "added") return "added";
  if (action === "removed") return "removed";
  if (action === "changed" || action === "modified") return "modified";
  return "renamed";
}

function matchesFilter(action: string, filter: ChangeFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return toChangeBucket(action) === filter;
}

function actionMarker(action: string): string {
  if (action === "added") return "+";
  if (action === "removed") return "-";
  if (action === "changed" || action === "modified") return "~";
  if (action === "rename_suggest") return "R?";
  return "R";
}

function actionTone(action: string): string {
  if (action === "added") return "text-emerald-600 dark:text-emerald-300";
  if (action === "removed") return "text-rose-600 dark:text-rose-300";
  if (action === "changed" || action === "modified") return "text-sky-600 dark:text-sky-300";
  return "text-amber-600 dark:text-amber-300";
}

function diffLineTone(prefix: "-" | "+"): string {
  return prefix === "-"
    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function neutralLineTone(kind: Exclude<DiffLineKind, "remove" | "add">): string {
  if (kind === "same") {
    return "bg-muted/40 text-muted-foreground";
  }
  return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function normalizeComparableValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s_\-./\\]+/g, "")
    .trim();
}

function tokenizeSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .split(/[\s_\-./\\]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isSubsequence(query: string, target: string): boolean {
  if (!query) {
    return true;
  }
  let queryIndex = 0;
  for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex += 1) {
    if (query[queryIndex] === target[targetIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      current[col] = Math.min(
        previous[col] + 1,
        current[col - 1] + 1,
        previous[col - 1] + cost,
      );
    }
    for (let col = 0; col <= right.length; col += 1) {
      previous[col] = current[col];
    }
  }
  return previous[right.length];
}

function allowedEditDistance(queryLength: number): number {
  if (queryLength <= 4) {
    return 1;
  }
  if (queryLength <= 7) {
    return 3;
  }
  if (queryLength <= 10) {
    return 4;
  }
  return 5;
}

function fuzzyTokenMatch(normalizedQuery: string, token: string): boolean {
  if (!normalizedQuery || !token) {
    return false;
  }
  if (token.includes(normalizedQuery)) {
    return true;
  }
  if (normalizedQuery.length >= 3 && isSubsequence(normalizedQuery, token)) {
    return true;
  }
  const distance = levenshteinDistance(normalizedQuery, token);
  return distance <= allowedEditDistance(normalizedQuery.length);
}

function fuzzyTableMatch(query: string, candidates: string[]): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeSearchText(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    if (normalizedCandidate.includes(normalizedQuery)) {
      return true;
    }
    if (normalizedQuery.length >= 3 && isSubsequence(normalizedQuery, normalizedCandidate)) {
      return true;
    }

    const tokens = tokenizeSearchText(candidate).map((token) => normalizeSearchText(token));
    if (tokens.some((token) => fuzzyTokenMatch(normalizedQuery, token))) {
      return true;
    }

    const compactDistance = levenshteinDistance(
      normalizedQuery,
      normalizedCandidate.slice(0, Math.max(normalizedQuery.length, 1)),
    );
    return compactDistance <= allowedEditDistance(normalizedQuery.length);
  });
}

function normalizeCommentSemantic(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function visualizeWhitespace(value: string): string {
  return value
    .replace(/\u3000/g, "□")
    .replace(/ /g, "·")
    .replace(/\t/g, "⇥");
}

function formatValueForDiff(value: string, forceVisibleWhitespace = false): string {
  if (value === "-") {
    return value;
  }
  const hasWhitespace = /[\s\u3000]/.test(value);
  if (!hasWhitespace && !forceVisibleWhitespace) {
    return value;
  }
  return `"${visualizeWhitespace(value)}"`;
}

function normalizeText(value: string | undefined | null): string {
  const text = value?.toString().trim();
  return text && text.length > 0 ? text : "-";
}

function normalizeBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return value ? "true" : "false";
}

function formatTableLabel(logical?: string, physical?: string): string {
  const logicalText = normalizeText(logical);
  const physicalText = normalizeText(physical);
  if (logicalText === "-" && physicalText === "-") {
    return "-";
  }
  if (logicalText === "-") {
    return `[${physicalText}]`;
  }
  if (physicalText === "-") {
    return logicalText;
  }
  return `${logicalText} [${physicalText}]`;
}

function formatColumnLabel(logical?: string, physical?: string): string {
  const logicalText = normalizeText(logical);
  const physicalText = normalizeText(physical);
  if (logicalText === "-" && physicalText === "-") {
    return "-";
  }
  if (logicalText === "-") {
    return physicalText;
  }
  if (physicalText === "-") {
    return logicalText;
  }
  return `${logicalText} (${physicalText})`;
}

function formatTablePathPart(table?: { logicalTableName?: string; physicalTableName?: string }): string {
  if (!table) {
    return "unknown_table";
  }
  return normalizeText(table.physicalTableName) !== "-"
    ? normalizeText(table.physicalTableName)
    : normalizeText(table.logicalTableName);
}

function formatColumnPathPart(column?: { logicalName?: string; physicalName?: string }): string {
  if (!column) {
    return "unknown_column";
  }
  return normalizeText(column.physicalName) !== "-"
    ? normalizeText(column.physicalName)
    : normalizeText(column.logicalName);
}

function stringifyColumnField(
  column: DiffColumn["newColumn"] | DiffColumn["oldColumn"],
  field: string,
): string {
  if (!column) {
    return "-";
  }
  if (field === "logicalName") return normalizeText(column.logicalName);
  if (field === "physicalName") return normalizeText(column.physicalName);
  if (field === "dataType") return normalizeText(column.dataType);
  if (field === "size") return normalizeText(column.size);
  if (field === "notNull") return normalizeBoolean(column.notNull);
  if (field === "isPk") return normalizeBoolean(column.isPk);
  if (field === "comment") return normalizeText(column.comment);
  if (field === "autoIncrement") return normalizeBoolean(column.autoIncrement);
  return "-";
}

function buildFieldRenderLines(
  field: string,
  oldValueRaw: string,
  newValueRaw: string,
  action: string,
): DiffRenderLine[] {
  const oldValue = normalizeText(oldValueRaw);
  const newValue = normalizeText(newValueRaw);
  const label = formatFieldLabel(field);

  if (action === "added") {
    return [
      {
        prefix: "+",
        kind: "add",
        text: `${label}: ${formatValueForDiff(newValue)}`,
      },
    ];
  }

  if (action === "removed") {
    return [
      {
        prefix: "-",
        kind: "remove",
        text: `${label}: ${formatValueForDiff(oldValue)}`,
      },
    ];
  }

  if (oldValue === newValue) {
    return [
      {
        prefix: "//",
        kind: "same",
        text: `${label}: ${formatValueForDiff(newValue)}`,
      },
    ];
  }

  const semanticEqual = normalizeComparableValue(oldValue) === normalizeComparableValue(newValue);
  if (semanticEqual) {
    return [
      {
        prefix: "~",
        kind: "hint",
        text: `${label}: ${formatValueForDiff(oldValue, true)} -> ${formatValueForDiff(newValue, true)}`,
        hint: "whitespaceOnly",
      },
    ];
  }

  return [
    {
      prefix: "-",
      kind: "remove",
      text: `${label}: ${formatValueForDiff(oldValue)}`,
    },
    {
      prefix: "+",
      kind: "add",
      text: `${label}: ${formatValueForDiff(newValue)}`,
    },
  ];
}

function buildIdentityRenderLines(
  label: "table" | "column",
  oldValueRaw: string,
  newValueRaw: string,
  action: string,
): DiffRenderLine[] {
  const oldValue = normalizeText(oldValueRaw);
  const newValue = normalizeText(newValueRaw);
  const field = `${label}.name`;

  if (action === "added") {
    return [{ prefix: "+", kind: "add", text: `${field}: ${formatValueForDiff(newValue)}` }];
  }
  if (action === "removed") {
    return [{ prefix: "-", kind: "remove", text: `${field}: ${formatValueForDiff(oldValue)}` }];
  }
  if (oldValue === newValue) {
    return [{ prefix: "//", kind: "same", text: `${field}: ${formatValueForDiff(newValue)}` }];
  }
  const semanticEqual = normalizeComparableValue(oldValue) === normalizeComparableValue(newValue);
  if (semanticEqual) {
    return [
      {
        prefix: "~",
        kind: "hint",
        text: `${field}: ${formatValueForDiff(oldValue, true)} -> ${formatValueForDiff(newValue, true)}`,
        hint: "whitespaceOnly",
      },
    ];
  }
  return [
    { prefix: "-", kind: "remove", text: `${field}: ${formatValueForDiff(oldValue)}` },
    { prefix: "+", kind: "add", text: `${field}: ${formatValueForDiff(newValue)}` },
  ];
}

function renderLineTone(line: DiffRenderLine): string {
  if (line.kind === "remove") {
    return diffLineTone("-");
  }
  if (line.kind === "add") {
    return diffLineTone("+");
  }
  return neutralLineTone(line.kind);
}

function formatFieldLabel(field: string): string {
  if (field === "logicalTableName") return "table.logicalName";
  if (field === "physicalTableName") return "table.physicalName";
  if (field === "logicalName") return "column.logicalName";
  if (field === "physicalName") return "column.physicalName";
  if (field === "dataType") return "column.dataType";
  if (field === "size") return "column.size";
  if (field === "notNull") return "column.notNull";
  if (field === "isPk") return "column.isPk";
  if (field === "comment") return "column.comment";
  if (field === "autoIncrement") return "column.autoIncrement";
  return field;
}

function matchesColumnFieldFilter(change: DiffColumn, filter: ColumnFieldFilter): boolean {
  if (filter === "all") {
    return true;
  }
  const fields = change.changedFields ?? [];
  if (filter === "name") {
    return fields.includes("logicalName") || fields.includes("physicalName");
  }
  if (filter === "nullable") {
    return fields.includes("notNull");
  }
  if (filter === "pk") {
    return fields.includes("isPk");
  }
  return fields.includes(filter);
}

function isCommentOnlyChange(change: DiffColumn): boolean {
  return change.action === "modified" && change.changedFields.length === 1 && change.changedFields[0] === "comment";
}

function isFormattingOnlyCommentChange(change: DiffColumn): boolean {
  if (!isCommentOnlyChange(change)) {
    return false;
  }
  const oldComment = change.oldColumn?.comment ?? "";
  const newComment = change.newColumn?.comment ?? "";
  return oldComment !== newComment && normalizeCommentSemantic(oldComment) === normalizeCommentSemantic(newComment);
}

function getColumnImpact(change: DiffColumn): ImpactGroup {
  if (change.action === "added") {
    return "non_breaking";
  }
  if (change.action === "removed" || change.action === "renamed" || change.action === "rename_suggest") {
    return "breaking";
  }

  const fields = new Set(change.changedFields);
  if (fields.size === 0) {
    return "non_breaking";
  }
  if (fields.size === 1 && fields.has("comment")) {
    return "metadata";
  }

  if (
    fields.has("dataType") ||
    fields.has("size") ||
    fields.has("notNull") ||
    fields.has("isPk") ||
    fields.has("autoIncrement") ||
    fields.has("physicalName")
  ) {
    return "breaking";
  }
  return "non_breaking";
}

function getTableImpact(change: DiffTable, visibleColumns: DiffColumn[]): ImpactGroup {
  if (change.action === "removed" || change.action === "renamed" || change.action === "rename_suggest") {
    return "breaking";
  }
  if (change.action === "added") {
    return "non_breaking";
  }

  const tableFields = new Set(change.changedFields);
  if (tableFields.has("physicalTableName")) {
    return "breaking";
  }
  if (tableFields.has("logicalTableName")) {
    return "non_breaking";
  }

  let hasBreaking = false;
  let hasNonBreaking = false;
  let hasMetadata = false;
  for (const columnChange of visibleColumns) {
    const impact = getColumnImpact(columnChange);
    if (impact === "breaking") hasBreaking = true;
    if (impact === "non_breaking") hasNonBreaking = true;
    if (impact === "metadata") hasMetadata = true;
  }
  if (hasBreaking) return "breaking";
  if (hasNonBreaking) return "non_breaking";
  if (hasMetadata) return "metadata";
  return "non_breaking";
}

function formatTableName(change: DiffTable, fallbackIndex: number): string {
  const before =
    change.oldTable?.physicalTableName ??
    change.oldTable?.logicalTableName;
  const after =
    change.newTable?.physicalTableName ??
    change.newTable?.logicalTableName;
  if ((change.action === "renamed" || change.action === "rename_suggest") && before && after && before !== after) {
    return `${before} -> ${after}`;
  }
  return after ?? before ?? `table_${fallbackIndex + 1}`;
}

function formatColumnName(change: DiffColumn, fallbackIndex: number): string {
  const before =
    change.oldColumn?.physicalName ??
    change.oldColumn?.logicalName;
  const after =
    change.newColumn?.physicalName ??
    change.newColumn?.logicalName;
  if ((change.action === "renamed" || change.action === "rename_suggest") && before && after && before !== after) {
    return `${before} -> ${after}`;
  }
  return after ?? before ?? `column_${fallbackIndex + 1}`;
}

function buildTableFieldDiffs(change: DiffTable): Array<{ field: string; oldValue: string; newValue: string }> {
  const defaultFields = ["logicalTableName", "physicalTableName"];
  const fields =
    change.action === "added" || change.action === "removed"
      ? defaultFields
      : (change.changedFields.length > 0 ? change.changedFields : defaultFields);

  return fields.map((field) => ({
    field,
    oldValue:
      field === "logicalTableName"
        ? normalizeText(change.oldTable?.logicalTableName)
        : normalizeText(change.oldTable?.physicalTableName),
    newValue:
      field === "logicalTableName"
        ? normalizeText(change.newTable?.logicalTableName)
        : normalizeText(change.newTable?.physicalTableName),
  }));
}

function buildColumnFieldDiffs(change: DiffColumn): Array<{ field: string; oldValue: string; newValue: string }> {
  const defaultFields = ["logicalName", "physicalName", "dataType", "size", "notNull", "isPk", "comment", "autoIncrement"];
  const fields =
    change.action === "added" || change.action === "removed"
      ? defaultFields
      : (change.changedFields.length > 0 ? change.changedFields : defaultFields);

  return fields
    .map((field) => ({
      field,
      oldValue: stringifyColumnField(change.oldColumn, field),
      newValue: stringifyColumnField(change.newColumn, field),
    }))
    .filter((item) => !(item.oldValue === "-" && item.newValue === "-"));
}

export function SchemaDiffPanel({ fileId, sheetName }: SchemaDiffPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: files } = useFiles();
  const historyQuery = useSchemaDiffHistory(fileId);
  const previewMutation = useSchemaDiffPreview();
  const confirmMutation = useConfirmSchemaDiffRenames();
  const alterPreviewMutation = useSchemaDiffAlterPreview();
  const alterExportMutation = useSchemaDiffAlterExport();

  const [selectionMode, setSelectionMode] = useState<"auto" | "manual">("auto");
  const [scope, setScope] = useState<"current_sheet" | "all_sheets">("current_sheet");
  const [manualOldFileId, setManualOldFileId] = useState<number | null>(null);
  const [forceRecompute, setForceRecompute] = useState(false);

  const [previewResult, setPreviewResult] = useState<SchemaDiffPreviewResponse | null>(null);
  const [renameDecisions, setRenameDecisions] = useState<Record<string, RenameDecisionDraft>>({});

  const [dialect, setDialect] = useState<"mysql" | "oracle">("mysql");
  const [outputMode, setOutputMode] = useState<"single_table" | "multi_table">("multi_table");
  const [packaging, setPackaging] = useState<"single_file" | "zip">("single_file");
  const [splitBySheet, setSplitBySheet] = useState(false);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false);
  const [alterResult, setAlterResult] = useState<SchemaDiffAlterPreviewResponse | null>(null);
  const [selectedArtifactName, setSelectedArtifactName] = useState<string>("");
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const [columnFieldFilter, setColumnFieldFilter] = useState<ColumnFieldFilter>("all");
  const [tableKeyword, setTableKeyword] = useState("");
  const [columnKeyword, setColumnKeyword] = useState("");
  const [selectedTableNodeKey, setSelectedTableNodeKey] = useState<string>("");
  const [showMetadataChanges, setShowMetadataChanges] = useState(false);
  const [hideFormattingOnly, setHideFormattingOnly] = useState(true);

  useEffect(() => {
    setPreviewResult(null);
    setAlterResult(null);
    setRenameDecisions({});
    setManualOldFileId(null);
    setChangeFilter("all");
    setColumnFieldFilter("all");
    setTableKeyword("");
    setColumnKeyword("");
    setSelectedTableNodeKey("");
    setShowMetadataChanges(false);
    setHideFormattingOnly(true);
  }, [fileId, sheetName]);

  useEffect(() => {
    if (!historyQuery.data) {
      return;
    }
    setManualOldFileId((current) => current ?? historyQuery.data?.autoRecommendedOldFileId ?? null);
  }, [historyQuery.data]);

  useEffect(() => {
    if (!alterResult || alterResult.artifacts.length === 0) {
      setSelectedArtifactName("");
      return;
    }
    setSelectedArtifactName((current) =>
      current && alterResult.artifacts.some((artifact) => artifact.artifactName === current)
        ? current
        : alterResult.artifacts[0].artifactName,
    );
  }, [alterResult]);

  const sortedCandidates = useMemo(() => {
    if (!historyQuery.data?.candidates) {
      return [];
    }
    return [...historyQuery.data.candidates].sort((left, right) => {
      const confidenceDelta = (right.confidence ?? 0) - (left.confidence ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      const timeDelta = parseUploadedAtMillis(right.uploadedAt) - parseUploadedAtMillis(left.uploadedAt);
      if (timeDelta !== 0) return timeDelta;
      return right.fileId - left.fileId;
    });
  }, [historyQuery.data]);

  const fileNameById = useMemo(() => {
    const map = new Map<number, string>();
    (files ?? []).forEach((file) => {
      map.set(file.id, file.originalName);
    });
    return map;
  }, [files]);

  const historyCandidateById = useMemo(() => {
    const map = new Map<number, { originalName: string; uploadedAt?: string }>();
    (historyQuery.data?.candidates ?? []).forEach((candidate) => {
      map.set(candidate.fileId, {
        originalName: candidate.originalName,
        uploadedAt: candidate.uploadedAt,
      });
    });
    return map;
  }, [historyQuery.data]);

  const comparingOldFileId = useMemo(() => {
    if (previewResult?.link.oldFileId) {
      return previewResult.link.oldFileId;
    }
    if (selectionMode === "manual") {
      return manualOldFileId;
    }
    return historyQuery.data?.autoRecommendedOldFileId ?? null;
  }, [previewResult, selectionMode, manualOldFileId, historyQuery.data]);

  const comparingMode = previewResult?.link.mode ?? selectionMode;
  const comparingNewFileName = fileId ? fileNameById.get(fileId) ?? null : null;
  const comparingOldFileName = comparingOldFileId
    ? fileNameById.get(comparingOldFileId) ?? historyCandidateById.get(comparingOldFileId)?.originalName ?? null
    : null;
  const comparingOldUploadedAt = comparingOldFileId
    ? historyCandidateById.get(comparingOldFileId)?.uploadedAt
    : undefined;

  const currentSheetLikelyUnmatched = useMemo(() => {
    if (!previewResult || scope !== "current_sheet") {
      return false;
    }
    if (previewResult.sheets.length === 0) {
      return false;
    }
    const tableChanges = previewResult.sheets.flatMap((sheet) => sheet.tableChanges);
    if (tableChanges.length === 0) {
      return false;
    }
    return tableChanges.every((item) => item.action === "added");
  }, [previewResult, scope]);

  const previewRequest = useMemo<SchemaDiffPreviewRequest | null>(() => {
    if (!fileId) {
      return null;
    }
    if (scope === "current_sheet" && !sheetName) {
      return null;
    }
    if (selectionMode === "manual" && !manualOldFileId) {
      return null;
    }

    return {
      newFileId: fileId,
      mode: selectionMode,
      oldFileId: selectionMode === "manual" ? manualOldFileId ?? undefined : undefined,
      scope,
      sheetName: scope === "current_sheet" ? sheetName ?? undefined : undefined,
      forceRecompute,
    };
  }, [fileId, scope, sheetName, selectionMode, manualOldFileId, forceRecompute]);

  const canRunPreview = Boolean(previewRequest);

  const selectedArtifact = useMemo(() => {
    if (!alterResult || !selectedArtifactName) {
      return alterResult?.artifacts[0];
    }
    return alterResult.artifacts.find((artifact) => artifact.artifactName === selectedArtifactName) ?? alterResult.artifacts[0];
  }, [alterResult, selectedArtifactName]);

  const highlightedAlterTokens = useMemo(
    () => (selectedArtifact?.sql ? tokenizeSql(selectedArtifact.sql) : []),
    [selectedArtifact?.sql],
  );

  const changeCounts = useMemo(() => {
    const counts: Record<Exclude<ChangeFilter, "all">, number> = {
      added: 0,
      removed: 0,
      modified: 0,
      renamed: 0,
    };
    if (!previewResult) {
      return {
        ...counts,
        all: 0,
      };
    }
    previewResult.sheets.forEach((sheet) => {
      sheet.tableChanges.forEach((tableChange) => {
        counts[toChangeBucket(tableChange.action)] += 1;
        tableChange.columnChanges.forEach((columnChange) => {
          counts[toChangeBucket(columnChange.action)] += 1;
        });
      });
    });
    return {
      ...counts,
      all: counts.added + counts.removed + counts.modified + counts.renamed,
    };
  }, [previewResult]);

  const normalizedTableKeyword = useMemo(() => tableKeyword.trim(), [tableKeyword]);
  const normalizedColumnKeyword = useMemo(() => columnKeyword.trim().toLowerCase(), [columnKeyword]);

  const filteredSheets = useMemo(() => {
    if (!previewResult) {
      return [];
    }
    return previewResult.sheets
      .map((sheet) => {
        const visibleTableChanges = sheet.tableChanges
          .map((tableChange) => {
            const tableCandidates = [
              tableChange.oldTable?.logicalTableName ?? "",
              tableChange.oldTable?.physicalTableName ?? "",
              tableChange.newTable?.logicalTableName ?? "",
              tableChange.newTable?.physicalTableName ?? "",
            ];
            const tableMatchesKeyword = fuzzyTableMatch(normalizedTableKeyword, tableCandidates);
            if (!tableMatchesKeyword) {
              return null;
            }

            const visibleColumnChanges = tableChange.columnChanges.filter((columnChange) => {
              if (!matchesFilter(columnChange.action, changeFilter)) {
                return false;
              }
              if (!matchesColumnFieldFilter(columnChange, columnFieldFilter)) {
                return false;
              }
              if (!normalizedColumnKeyword) {
                const impact = getColumnImpact(columnChange);
                if (impact === "metadata" && !showMetadataChanges) {
                  return false;
                }
                if (hideFormattingOnly && isFormattingOnlyCommentChange(columnChange)) {
                  return false;
                }
                return true;
              }
              const candidate = `${columnChange.oldColumn?.logicalName ?? ""} ${columnChange.oldColumn?.physicalName ?? ""} ${columnChange.newColumn?.logicalName ?? ""} ${columnChange.newColumn?.physicalName ?? ""}`.toLowerCase();
              if (!candidate.includes(normalizedColumnKeyword)) {
                return false;
              }
              const impact = getColumnImpact(columnChange);
              if (impact === "metadata" && !showMetadataChanges) {
                return false;
              }
              if (hideFormattingOnly && isFormattingOnlyCommentChange(columnChange)) {
                return false;
              }
              return true;
            });
            const tableSelfImpact = getTableImpact(tableChange, tableChange.columnChanges);
            const tableSelfVisible =
              matchesFilter(tableChange.action, changeFilter) &&
              (tableSelfImpact !== "metadata" || showMetadataChanges);
            const tableVisible = tableSelfVisible || visibleColumnChanges.length > 0;

            if (!tableVisible) {
              return null;
            }
            const schemaCount = visibleColumnChanges.filter((item) => getColumnImpact(item) !== "metadata").length;
            const metadataCount = visibleColumnChanges.filter((item) => getColumnImpact(item) === "metadata").length;
            const formattingOnlyCount = visibleColumnChanges.filter((item) => isFormattingOnlyCommentChange(item)).length;
            return {
              tableChange,
              visibleColumnChanges,
              columnImpactSummary: {
                schemaCount,
                metadataCount,
                formattingOnlyCount,
              },
            };
          })
          .filter((item): item is {
            tableChange: DiffTable;
            visibleColumnChanges: DiffColumn[];
            columnImpactSummary: { schemaCount: number; metadataCount: number; formattingOnlyCount: number };
          } => Boolean(item));

        return {
          sheetName: sheet.sheetName,
          visibleTableChanges,
        };
      })
      .filter((sheet) => sheet.visibleTableChanges.length > 0);
  }, [previewResult, changeFilter, columnFieldFilter, normalizedTableKeyword, normalizedColumnKeyword, showMetadataChanges, hideFormattingOnly]);

  const filteredTableNodes = useMemo<DiffTableNode[]>(() => {
    return filteredSheets.flatMap((sheet) =>
      sheet.visibleTableChanges.map(({ tableChange, visibleColumnChanges, columnImpactSummary }, tableIndex) => {
        const tableName = formatTableName(tableChange, tableIndex);
        const tableLabelBefore = formatTableLabel(
          tableChange.oldTable?.logicalTableName,
          tableChange.oldTable?.physicalTableName,
        );
        const tableLabelAfter = formatTableLabel(
          tableChange.newTable?.logicalTableName,
          tableChange.newTable?.physicalTableName,
        );
        const oldTablePath = formatTablePathPart(tableChange.oldTable);
        const newTablePath = formatTablePathPart(tableChange.newTable);
        const key = `${sheet.sheetName}::${tableName}::${tableIndex}`;
        const impactGroup = getTableImpact(tableChange, visibleColumnChanges);

        return {
          key,
          sheetName: sheet.sheetName,
          tableChange,
          visibleColumnChanges,
          tableName,
          tableLabelBefore,
          tableLabelAfter,
          oldTablePath,
          newTablePath,
          impactGroup,
          columnImpactSummary,
        };
      }),
    );
  }, [filteredSheets]);

  useEffect(() => {
    setSelectedTableNodeKey((current) => {
      if (filteredTableNodes.length === 0) {
        return "";
      }
      if (current && filteredTableNodes.some((item) => item.key === current)) {
        return current;
      }
      return filteredTableNodes[0].key;
    });
  }, [filteredTableNodes]);

  const selectedTableNode = useMemo(
    () => filteredTableNodes.find((item) => item.key === selectedTableNodeKey) ?? null,
    [filteredTableNodes, selectedTableNodeKey],
  );

  const resolveFriendlyFieldLabel = (fieldKey: string): string => {
    switch (fieldKey) {
      case "table.name":
        return t("schemaDiff.fieldLabels.tableName");
      case "table.logicalName":
        return t("schemaDiff.fieldLabels.tableLogicalName");
      case "table.physicalName":
        return t("schemaDiff.fieldLabels.tablePhysicalName");
      case "column.name":
        return t("schemaDiff.fieldLabels.columnName");
      case "column.logicalName":
        return t("schemaDiff.fieldLabels.columnLogicalName");
      case "column.physicalName":
        return t("schemaDiff.fieldLabels.columnPhysicalName");
      case "column.dataType":
        return t("schemaDiff.fieldLabels.columnDataType");
      case "column.size":
        return t("schemaDiff.fieldLabels.columnSize");
      case "column.notNull":
        return t("schemaDiff.fieldLabels.columnNullable");
      case "column.isPk":
        return t("schemaDiff.fieldLabels.columnPk");
      case "column.comment":
        return t("schemaDiff.fieldLabels.columnComment");
      case "column.autoIncrement":
        return t("schemaDiff.fieldLabels.columnAutoIncrement");
      default:
        return fieldKey;
    }
  };

  const resolveHintLabel = (hintKey?: string): string => {
    if (!hintKey) {
      return "";
    }
    if (hintKey === "whitespaceOnly") {
      return t("schemaDiff.hints.whitespaceOnly");
    }
    return hintKey;
  };

  const toFriendlyLineText = (lineText: string): string => {
    const delimiterIndex = lineText.indexOf(":");
    if (delimiterIndex <= 0) {
      return lineText;
    }
    const rawKey = lineText.slice(0, delimiterIndex).trim();
    const rest = lineText.slice(delimiterIndex + 1);
    return `${resolveFriendlyFieldLabel(rawKey)}:${rest}`;
  };

  const groupedTableNodes = useMemo(() => {
    return {
      breaking: filteredTableNodes.filter((node) => node.impactGroup === "breaking"),
      non_breaking: filteredTableNodes.filter((node) => node.impactGroup === "non_breaking"),
      metadata: filteredTableNodes.filter((node) => node.impactGroup === "metadata"),
    };
  }, [filteredTableNodes]);

  const metadataSummary = useMemo(() => {
    let commentOnlyTotal = 0;
    let formattingOnlyTotal = 0;
    let semanticCommentTotal = 0;
    if (!previewResult) {
      return { commentOnlyTotal, formattingOnlyTotal, semanticCommentTotal };
    }
    for (const sheet of previewResult.sheets) {
      for (const tableChange of sheet.tableChanges) {
        for (const columnChange of tableChange.columnChanges) {
          if (isCommentOnlyChange(columnChange)) {
            commentOnlyTotal += 1;
            if (isFormattingOnlyCommentChange(columnChange)) {
              formattingOnlyTotal += 1;
            } else {
              semanticCommentTotal += 1;
            }
          }
        }
      }
    }
    return { commentOnlyTotal, formattingOnlyTotal, semanticCommentTotal };
  }, [previewResult]);

  const renameDecisionSummary = useMemo(() => {
    const summary: Record<RenameDecisionDraft, number> = {
      pending: 0,
      accept: 0,
      reject: 0,
    };
    if (!previewResult) {
      return summary;
    }
    previewResult.renameSuggestions.forEach((suggestion) => {
      const decision = renameDecisions[suggestion.entityKey] ?? suggestion.decision;
      summary[decision] += 1;
    });
    return summary;
  }, [previewResult, renameDecisions]);

  const decidedRenameCount = renameDecisionSummary.accept + renameDecisionSummary.reject;

  const setSuggestionDecision = (entityKey: string, decision: RenameDecisionDraft) => {
    setRenameDecisions((previous) => ({
      ...previous,
      [entityKey]: decision,
    }));
  };

  const renameSuggestionCounts = useMemo(() => {
    const counts = {
      all: previewResult?.renameSuggestions.length ?? 0,
      table: 0,
      column: 0,
    };
    if (!previewResult) {
      return counts;
    }
    previewResult.renameSuggestions.forEach((suggestion) => {
      if (suggestion.entityType === "table") {
        counts.table += 1;
      } else if (suggestion.entityType === "column") {
        counts.column += 1;
      }
    });
    return counts;
  }, [previewResult]);

  const applyBatchRenameDecision = (decision: RenameDecisionDraft, target: "all" | "table" | "column" = "all") => {
    if (!previewResult) {
      return;
    }
    setRenameDecisions((previous) => {
      const next = { ...previous };
      previewResult.renameSuggestions.forEach((suggestion) => {
        if (target !== "all" && suggestion.entityType !== target) {
          return;
        }
        next[suggestion.entityKey] = decision;
      });
      return next;
    });
  };

  const handleRunPreview = async () => {
    if (!previewRequest) {
      toast({
        title: t("errors.common.title"),
        description: t("schemaDiff.toast.invalidPreviewOptions"),
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await previewMutation.mutateAsync(previewRequest);
      setPreviewResult(response);
      setAlterResult(null);
      const nextDecisionMap: Record<string, RenameDecisionDraft> = {};
      response.renameSuggestions.forEach((suggestion) => {
        nextDecisionMap[suggestion.entityKey] = suggestion.decision;
      });
      setRenameDecisions(nextDecisionMap);
      toast({
        title: t("schemaDiff.toast.diffReadyTitle"),
        description: response.cacheHit
          ? t("schemaDiff.toast.diffReadyCacheHit")
          : t("schemaDiff.toast.diffReadyFresh"),
      });
    } catch (error) {
      const translated = translateApiError(error, t, { includeIssues: false });
      toast({
        title: translated.title,
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  const handleConfirmRenames = async () => {
    if (!previewResult) {
      return;
    }
    const decisions = previewResult.renameSuggestions
      .map((item) => ({
        entityType: item.entityType,
        entityKey: item.entityKey,
        decision: renameDecisions[item.entityKey] ?? item.decision,
      }))
      .filter((item) => item.decision === "accept" || item.decision === "reject");

    if (decisions.length === 0) {
      toast({
        title: t("schemaDiff.toast.noDecisionsTitle"),
        description: t("schemaDiff.toast.noDecisionsDescription"),
      });
      return;
    }

    try {
      const response = await confirmMutation.mutateAsync({
        diffId: previewResult.diffId,
        decisions: decisions.map((item) => ({
          entityType: item.entityType,
          entityKey: item.entityKey,
          decision: item.decision as "accept" | "reject",
        })),
      });
      setPreviewResult((previous) =>
        previous
          ? {
              ...previous,
              summary: response.summary,
              sheets: response.sheets,
              renameSuggestions: response.renameSuggestions,
            }
          : previous,
      );
      const nextDecisionMap: Record<string, RenameDecisionDraft> = {};
      response.renameSuggestions.forEach((suggestion) => {
        nextDecisionMap[suggestion.entityKey] = suggestion.decision;
      });
      setRenameDecisions(nextDecisionMap);
      setAlterResult(null);
      toast({
        title: t("schemaDiff.toast.renameAppliedTitle"),
        description: t("schemaDiff.toast.renameAppliedDescription"),
      });
    } catch (error) {
      const translated = translateApiError(error, t, { includeIssues: false });
      toast({
        title: translated.title,
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  const handleGenerateAlterPreview = async () => {
    if (!previewResult) {
      return;
    }
    try {
      const response = await alterPreviewMutation.mutateAsync({
        diffId: previewResult.diffId,
        dialect,
        outputMode,
        packaging,
        splitBySheet,
        includeUnconfirmed,
      });
      setAlterResult(response);
      toast({
        title: t("schemaDiff.toast.alterPreviewTitle"),
        description: t("schemaDiff.toast.alterPreviewDescription", { count: response.artifacts.length }),
      });
    } catch (error) {
      const translated = translateApiError(error, t, { includeIssues: false });
      toast({
        title: translated.title,
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  const handleExportAlter = async () => {
    if (!previewResult) {
      return;
    }
    try {
      const result = await alterExportMutation.mutateAsync({
        diffId: previewResult.diffId,
        dialect,
        outputMode,
        packaging,
        splitBySheet,
        includeUnconfirmed,
      });
      const timestamp = formatTimestamp();
      const fallbackFilename =
        packaging === "zip" ? `alter_${dialect}_${timestamp}.zip` : `alter_${dialect}_${timestamp}.sql`;
      const filename = parseFilenameFromContentDisposition(result.contentDisposition) ?? fallbackFilename;

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast({
        title: t("schemaDiff.toast.exportCompletedTitle"),
        description: filename,
      });
    } catch (error) {
      const translated = translateApiError(error, t, { includeIssues: false });
      toast({
        title: translated.title,
        description: translated.description,
        variant: "destructive",
      });
    }
  };

  if (!fileId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
        <AlertTriangle className="w-7 h-7 opacity-60" />
        <p className="text-sm">{t("schemaDiff.empty.selectFile")}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-5 space-y-4">
        <Card className="border-border/60 bg-gradient-to-br from-slate-950/[0.03] to-transparent dark:from-slate-100/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {t("schemaDiff.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.currentComparison")}</p>
              {fileId && comparingOldFileId ? (
                <div className="space-y-1.5 text-xs">
                  <p className="font-mono rounded border border-border/60 bg-background/80 px-2 py-1">
                    diff --schema a/{comparingOldFileName ?? `file_${comparingOldFileId}`} b/{comparingNewFileName ?? `file_${fileId}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{t("schemaDiff.compare.old")} #{comparingOldFileId}</Badge>
                    <span className="font-medium">{comparingOldFileName ?? t("schemaDiff.compare.unknownFile")}</span>
                    {comparingOldUploadedAt ? (
                      <span className="text-[10px] text-muted-foreground">
                        {t("schemaDiff.compare.uploadedAt")} {formatCandidateUploadedAt(comparingOldUploadedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{t("schemaDiff.compare.new")} #{fileId}</Badge>
                    <span className="font-medium">{comparingNewFileName ?? t("schemaDiff.compare.unknownFile")}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {comparingMode === "auto"
                        ? t("schemaDiff.baseline.auto")
                        : t("schemaDiff.baseline.manual")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {scope === "current_sheet"
                        ? t("schemaDiff.scope.currentSheetWithName", {
                            sheetName: sheetName ?? t("schemaDiff.scope.currentSheet"),
                          })
                        : t("schemaDiff.scope.allSheets")}
                    </Badge>
                    {previewResult?.link.scoreBreakdown ? (
                      <Badge variant="outline" className="text-[10px]">
                        {t("schemaDiff.compare.scoreBreakdown", {
                          f: previewResult.link.scoreBreakdown.fileName.toFixed(2),
                          m: previewResult.link.scoreBreakdown.uploadedAt.toFixed(2),
                          c: previewResult.link.scoreBreakdown.content.toFixed(2),
                        })}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("schemaDiff.compare.emptyHint")}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.controls.baselineMode")}</p>
                <Select value={selectionMode} onValueChange={(value) => setSelectionMode(value as "auto" | "manual")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("schemaDiff.controls.autoDetect")}</SelectItem>
                    <SelectItem value="manual">{t("schemaDiff.controls.manualSelect")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.controls.scope")}</p>
                <Select value={scope} onValueChange={(value) => setScope(value as "current_sheet" | "all_sheets")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_sheet">{t("schemaDiff.scope.currentSheet")}</SelectItem>
                    <SelectItem value="all_sheets">{t("schemaDiff.scope.allSheets")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <details className="rounded-md border border-border/60 bg-muted/20">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
                {t("schemaDiff.controls.advancedOptions")}
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className={cn(selectionMode !== "manual" && "opacity-50")}>
                  <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.controls.manualBaseline")}</p>
                  <Select
                    value={manualOldFileId ? String(manualOldFileId) : ""}
                    onValueChange={(value) => setManualOldFileId(Number(value))}
                    disabled={selectionMode !== "manual"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t("schemaDiff.controls.pickHistoryFile")} />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedCandidates.map((candidate) => (
                        <SelectItem key={candidate.fileId} value={String(candidate.fileId)}>
                          {candidate.originalName} · #{candidate.fileId} · {formatCandidateUploadedAt(candidate.uploadedAt)} · {(candidate.confidence ?? 0).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-border/70 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{t("schemaDiff.controls.forceRecompute")}</p>
                    <Switch checked={forceRecompute} onCheckedChange={setForceRecompute} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{t("schemaDiff.controls.forceRecomputeHint")}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => historyQuery.refetch()}
                  disabled={historyQuery.isFetching}
                >
                  {historyQuery.isFetching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  {t("schemaDiff.controls.refreshHistory")}
                </Button>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={handleRunPreview} disabled={!canRunPreview || previewMutation.isPending}>
                {previewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                {t("schemaDiff.controls.runDiff")}
              </Button>
              {previewResult?.cacheHit ? (
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300/40">
                  {t("schemaDiff.badges.cacheHit")}
                </Badge>
              ) : null}
              {currentSheetLikelyUnmatched ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setScope("all_sheets")}
                >
                  {t("schemaDiff.controls.switchToAllSheets")}
                </Button>
              ) : null}
            </div>
            {scope === "current_sheet" && !sheetName ? (
              <p className="text-[11px] text-amber-600">{t("schemaDiff.warnings.currentSheetNotSelected")}</p>
            ) : null}
            {currentSheetLikelyUnmatched ? (
              <p className="text-[11px] text-amber-600">{t("schemaDiff.warnings.sheetBaselineUnmatched")}</p>
            ) : null}
          </CardContent>
        </Card>

        {previewResult ? (
          <>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-xs font-mono">
                +{changeCounts.added} / -{changeCounts.removed} / ~{changeCounts.modified} / R{changeCounts.renamed}
                <span className="text-muted-foreground"> · {t("schemaDiff.summary.pendingRenameConfirm", { count: previewResult.summary.pendingConfirmations })}</span>
              </p>
            </div>

            {previewResult.mcpHints.nextActions.length > 0 ? (
              <Card className="border-border/60 bg-muted/20">
                <CardContent className="p-3 space-y-1.5">
                  <details>
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      {t("schemaDiff.notes.title")} ({previewResult.mcpHints.nextActions.length})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {previewResult.mcpHints.nextActions.slice(0, 3).map((note, index) => (
                        <p key={`note-${index}`} className="text-xs">{note}</p>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            ) : null}

            {previewResult.renameSuggestions.length > 0 ? (
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {t("schemaDiff.rename.title")} ({previewResult.renameSuggestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] border-emerald-300/40 text-emerald-700 dark:text-emerald-300">
                        {t("schemaDiff.rename.acceptCount", { count: renameDecisionSummary.accept })}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-rose-300/40 text-rose-700 dark:text-rose-300">
                        {t("schemaDiff.rename.rejectCount", { count: renameDecisionSummary.reject })}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {t("schemaDiff.rename.pendingCount", { count: renameDecisionSummary.pending })}
                      </Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground">{t("schemaDiff.rename.singleClickHint")}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t("schemaDiff.rename.bulkAllLabel", { count: renameSuggestionCounts.all })}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("accept", "all")}
                      >
                        {t("schemaDiff.rename.bulkAccept")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("reject", "all")}
                      >
                        {t("schemaDiff.rename.bulkReject")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("pending", "all")}
                      >
                        {t("schemaDiff.rename.bulkPending")}
                      </Button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t("schemaDiff.rename.bulkTableLabel", { count: renameSuggestionCounts.table })}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("accept", "table")}
                        disabled={renameSuggestionCounts.table === 0}
                      >
                        {t("schemaDiff.rename.bulkAccept")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("reject", "table")}
                        disabled={renameSuggestionCounts.table === 0}
                      >
                        {t("schemaDiff.rename.bulkReject")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("pending", "table")}
                        disabled={renameSuggestionCounts.table === 0}
                      >
                        {t("schemaDiff.rename.bulkPending")}
                      </Button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t("schemaDiff.rename.bulkColumnLabel", { count: renameSuggestionCounts.column })}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("accept", "column")}
                        disabled={renameSuggestionCounts.column === 0}
                      >
                        {t("schemaDiff.rename.bulkAccept")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("reject", "column")}
                        disabled={renameSuggestionCounts.column === 0}
                      >
                        {t("schemaDiff.rename.bulkReject")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => applyBatchRenameDecision("pending", "column")}
                        disabled={renameSuggestionCounts.column === 0}
                      >
                        {t("schemaDiff.rename.bulkPending")}
                      </Button>
                    </div>
                  </div>

                  {previewResult.renameSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.entityKey}
                      className="rounded-md border border-border/60 p-2.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_72px_210px] items-center gap-2"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {suggestion.entityType}
                        </Badge>
                        <p className="text-xs font-medium truncate">
                          {suggestion.entityType === "table"
                            ? `${suggestion.tableNameBefore ?? "-"} → ${suggestion.tableNameAfter ?? "-"}`
                            : `${suggestion.columnNameBefore ?? "-"} → ${suggestion.columnNameAfter ?? "-"} (${suggestion.tableNameAfter ?? suggestion.tableNameBefore ?? "-"})`}
                        </p>
                      </div>
                      <div className="md:justify-self-center">
                        <Badge variant="outline" className="text-[10px]">
                          {suggestion.confidence.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="md:justify-self-end">
                        <ToggleGroup
                          type="single"
                          value={renameDecisions[suggestion.entityKey] ?? suggestion.decision}
                          onValueChange={(value) => setSuggestionDecision(suggestion.entityKey, (value || "pending") as RenameDecisionDraft)}
                          className="gap-0 rounded-md border border-border/70 bg-background/80 p-0.5"
                        >
                          <ToggleGroupItem
                            value="accept"
                            variant="default"
                            size="sm"
                            className="min-h-7 min-w-[56px] rounded-[6px] px-2 text-[11px] text-muted-foreground data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-700 dark:data-[state=on]:text-emerald-300"
                          >
                            {t("schemaDiff.rename.accept")}
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="reject"
                            variant="default"
                            size="sm"
                            className="min-h-7 min-w-[56px] rounded-[6px] px-2 text-[11px] text-muted-foreground data-[state=on]:bg-rose-500/15 data-[state=on]:text-rose-700 dark:data-[state=on]:text-rose-300"
                          >
                            {t("schemaDiff.rename.reject")}
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="pending"
                            variant="default"
                            size="sm"
                            className="min-h-7 min-w-[56px] rounded-[6px] px-2 text-[11px] text-muted-foreground data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-700 dark:data-[state=on]:text-sky-300"
                          >
                            {t("schemaDiff.rename.pending")}
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleConfirmRenames}
                    disabled={confirmMutation.isPending || previewResult.renameSuggestions.length === 0 || decidedRenameCount === 0}
                  >
                    {confirmMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    {t("schemaDiff.rename.applyDecisions")} ({decidedRenameCount})
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("schemaDiff.diffView.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: "all", label: t("schemaDiff.filters.all"), count: changeCounts.all },
                      { key: "added", label: "+", count: changeCounts.added },
                      { key: "removed", label: "-", count: changeCounts.removed },
                      { key: "modified", label: "~", count: changeCounts.modified },
                      { key: "renamed", label: "R", count: changeCounts.renamed },
                    ].map((item) => (
                      <Button
                        key={item.key}
                        type="button"
                        size="sm"
                        variant={changeFilter === item.key ? "default" : "outline"}
                        className="h-7 px-2 text-[10px] font-mono"
                        onClick={() => setChangeFilter(item.key as ChangeFilter)}
                      >
                        {item.label} {item.count}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      value={tableKeyword}
                      onChange={(event) => setTableKeyword(event.target.value)}
                      className="h-8 text-xs"
                      placeholder={t("schemaDiff.filters.tableKeywordPlaceholder")}
                    />
                    <Input
                      value={columnKeyword}
                      onChange={(event) => setColumnKeyword(event.target.value)}
                      className="h-8 text-xs"
                      placeholder={t("schemaDiff.filters.columnKeywordPlaceholder")}
                    />
                  </div>
                  <details className="rounded border border-border/60 bg-background/60">
                    <summary className="cursor-pointer select-none px-2.5 py-2 text-xs">
                      {t("schemaDiff.filters.advancedFilters")}
                    </summary>
                    <div className="px-2.5 pb-2.5 space-y-2">
                      <Select value={columnFieldFilter} onValueChange={(value) => setColumnFieldFilter(value as ColumnFieldFilter)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("schemaDiff.filters.columnFieldAll")}</SelectItem>
                          <SelectItem value="name">{t("schemaDiff.filters.columnFieldName")}</SelectItem>
                          <SelectItem value="dataType">{t("schemaDiff.filters.columnFieldDataType")}</SelectItem>
                          <SelectItem value="size">{t("schemaDiff.filters.columnFieldSize")}</SelectItem>
                          <SelectItem value="nullable">{t("schemaDiff.filters.columnFieldNullable")}</SelectItem>
                          <SelectItem value="pk">{t("schemaDiff.filters.columnFieldPk")}</SelectItem>
                          <SelectItem value="comment">{t("schemaDiff.filters.columnFieldComment")}</SelectItem>
                          <SelectItem value="autoIncrement">{t("schemaDiff.filters.columnFieldAutoIncrement")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="rounded-md border border-border/60 px-2.5 py-2 flex items-center justify-between">
                          <div>
                            <p className="text-[11px]">{t("schemaDiff.filters.showMetadata")}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {t("schemaDiff.filters.showMetadataHint")}
                            </p>
                          </div>
                          <Switch checked={showMetadataChanges} onCheckedChange={setShowMetadataChanges} />
                        </div>
                        <div className="rounded-md border border-border/60 px-2.5 py-2 flex items-center justify-between">
                          <div>
                            <p className="text-[11px]">{t("schemaDiff.filters.hideFormattingOnly")}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {t("schemaDiff.filters.hideFormattingOnlyHint")}
                            </p>
                          </div>
                          <Switch checked={hideFormattingOnly} onCheckedChange={setHideFormattingOnly} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {t("schemaDiff.summary.commentOnlyTotal", { count: metadataSummary.commentOnlyTotal })}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {t("schemaDiff.summary.formattingOnlyTotal", { count: metadataSummary.formattingOnlyTotal })}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {t("schemaDiff.summary.semanticCommentTotal", { count: metadataSummary.semanticCommentTotal })}
                        </Badge>
                      </div>
                    </div>
                  </details>
                </div>

                {filteredTableNodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {previewResult.sheets.length === 0
                      ? t("schemaDiff.empty.noChanges")
                      : t("schemaDiff.empty.noChangesInFilter")}
                  </p>
                ) : (
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="border-b lg:border-b-0 lg:border-r border-border/60">
                        <div className="px-3 py-2 border-b border-border/60 text-[11px] text-muted-foreground">
                          {t("schemaDiff.tree.changedTables", { count: filteredTableNodes.length })}
                        </div>
                        <ScrollArea className="h-[420px]">
                          <div className="p-2 space-y-1.5">
                            {[
                              {
                                key: "breaking" as ImpactGroup,
                                title: t("schemaDiff.tree.groups.breaking"),
                                nodes: groupedTableNodes.breaking,
                                badgeClass: "text-rose-600 border-rose-300/50",
                              },
                              {
                                key: "non_breaking" as ImpactGroup,
                                title: t("schemaDiff.tree.groups.nonBreaking"),
                                nodes: groupedTableNodes.non_breaking,
                                badgeClass: "text-sky-600 border-sky-300/50",
                              },
                              {
                                key: "metadata" as ImpactGroup,
                                title: t("schemaDiff.tree.groups.metadata"),
                                nodes: groupedTableNodes.metadata,
                                badgeClass: "text-muted-foreground border-border/70",
                              },
                            ].filter((group) => group.nodes.length > 0).map((group) => (
                              <div key={group.key} className="space-y-1.5">
                                <div className="flex items-center gap-2 px-1">
                                  <Badge variant="outline" className={cn("text-[10px]", group.badgeClass)}>
                                    {group.title}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{group.nodes.length}</span>
                                </div>
                                {group.nodes.map((node) => {
                                  const tableTitle =
                                    node.tableLabelBefore !== "-" &&
                                    node.tableLabelAfter !== "-" &&
                                    node.tableLabelBefore !== node.tableLabelAfter
                                      ? `${node.tableLabelBefore} -> ${node.tableLabelAfter}`
                                      : node.tableLabelAfter !== "-" ? node.tableLabelAfter : node.tableLabelBefore;
                                  return (
                                    <button
                                      key={node.key}
                                      type="button"
                                      onClick={() => setSelectedTableNodeKey(node.key)}
                                      className={cn(
                                        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                                        selectedTableNodeKey === node.key
                                          ? "border-primary/50 bg-primary/10"
                                          : "border-border/60 hover:bg-muted/40",
                                      )}
                                    >
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className={cn("w-5 text-center font-mono font-semibold", actionTone(node.tableChange.action))}>
                                          {actionMarker(node.tableChange.action)}
                                        </span>
                                        <span className="truncate font-medium">{tableTitle}</span>
                                      </div>
                                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                        <span className="truncate">sheet/{node.sheetName}</span>
                                      </div>
                                      <div className="mt-1 flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] font-mono">
                                          {t("schemaDiff.tree.columnsBadge", { count: node.visibleColumnChanges.length })}
                                        </Badge>
                                        {node.columnImpactSummary.metadataCount > 0 ? (
                                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/70">
                                            {t("schemaDiff.tree.metadataBadge", { count: node.columnImpactSummary.metadataCount })}
                                          </Badge>
                                        ) : null}
                                        {node.tableChange.requiresConfirmation ? (
                                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300/40">
                                            {t("schemaDiff.rename.confirm")}
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>

                      <div className="min-w-0">
                        {!selectedTableNode ? (
                          <div className="h-[420px] flex items-center justify-center text-xs text-muted-foreground">
                            {t("schemaDiff.tree.selectLeftHint")}
                          </div>
                        ) : (
                          <ScrollArea className="h-[420px]">
                            <div className="p-3 space-y-3">
                              {(() => {
                                const node = selectedTableNode;
                                const tableFieldDiffs = buildTableFieldDiffs(node.tableChange);
                                const tablePropertyDiffs = tableFieldDiffs.filter(
                                  (field) => field.field !== "logicalTableName" && field.field !== "physicalTableName",
                                );
                                const tableIdentityLines = buildIdentityRenderLines(
                                  "table",
                                  node.tableLabelBefore,
                                  node.tableLabelAfter,
                                  node.tableChange.action,
                                );
                                const tableTitle =
                                  node.tableLabelBefore !== "-" &&
                                  node.tableLabelAfter !== "-" &&
                                  node.tableLabelBefore !== node.tableLabelAfter
                                    ? `${node.tableLabelBefore} -> ${node.tableLabelAfter}`
                                    : node.tableLabelAfter !== "-" ? node.tableLabelAfter : node.tableLabelBefore;
                                return (
                                  <>
                                    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                                      <p className="font-mono text-[11px]">diff --table a/{node.oldTablePath} b/{node.newTablePath}</p>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <p className="text-xs">{tableTitle}</p>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[10px]",
                                            node.impactGroup === "breaking"
                                              ? "text-rose-600 border-rose-300/50"
                                              : node.impactGroup === "non_breaking"
                                                ? "text-sky-600 border-sky-300/50"
                                                : "text-muted-foreground border-border/70",
                                          )}
                                        >
                                          {node.impactGroup === "breaking"
                                            ? t("schemaDiff.tree.groups.breaking")
                                            : node.impactGroup === "non_breaking"
                                              ? t("schemaDiff.tree.groups.nonBreaking")
                                              : t("schemaDiff.tree.groups.metadata")}
                                        </Badge>
                                      </div>
                                    </div>

                                    <div className="rounded-md border border-border/60 bg-card">
                                      <div className="px-2 py-1 border-b border-border/50 text-[10px] font-mono text-muted-foreground">
                                        @@ table @@
                                      </div>
                                      <div className="px-2 py-2 space-y-1 font-mono text-[11px]">
                                        {tableIdentityLines.map((line, lineIndex) => (
                                          <div key={`table-identity-${lineIndex}`} className={cn("rounded px-2 py-1", renderLineTone(line))}>
                                            {line.prefix} {toFriendlyLineText(line.text)}
                                            {line.hint ? (
                                              <span className="ml-2 text-[10px] opacity-80">
                                                ({resolveHintLabel(line.hint)})
                                              </span>
                                            ) : null}
                                          </div>
                                        ))}
                                        {tablePropertyDiffs.flatMap((field) =>
                                          buildFieldRenderLines(field.field, field.oldValue, field.newValue, node.tableChange.action),
                                        ).map((line, lineIndex) => (
                                          <div key={`table-field-${lineIndex}`} className={cn("rounded px-2 py-1", renderLineTone(line))}>
                                            {line.prefix} {toFriendlyLineText(line.text)}
                                            {line.hint ? (
                                              <span className="ml-2 text-[10px] opacity-80">
                                                ({resolveHintLabel(line.hint)})
                                              </span>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {node.visibleColumnChanges.map((columnChange, columnIndex) => {
                                      const columnName = formatColumnName(columnChange, columnIndex);
                                      const oldColumnLabel = formatColumnLabel(
                                        columnChange.oldColumn?.logicalName,
                                        columnChange.oldColumn?.physicalName,
                                      );
                                      const newColumnLabel = formatColumnLabel(
                                        columnChange.newColumn?.logicalName,
                                        columnChange.newColumn?.physicalName,
                                      );
                                      const columnTitle =
                                        oldColumnLabel !== "-" && newColumnLabel !== "-" && oldColumnLabel !== newColumnLabel
                                          ? `${oldColumnLabel} -> ${newColumnLabel}`
                                          : newColumnLabel !== "-" ? newColumnLabel : oldColumnLabel;
                                      const oldColumnPath = formatColumnPathPart(columnChange.oldColumn);
                                      const newColumnPath = formatColumnPathPart(columnChange.newColumn);
                                      const columnIdentityLines = buildIdentityRenderLines(
                                        "column",
                                        oldColumnLabel,
                                        newColumnLabel,
                                        columnChange.action,
                                      );
                                      const columnPropertyDiffs = buildColumnFieldDiffs(columnChange).filter(
                                        (field) => field.field !== "logicalName" && field.field !== "physicalName",
                                      );

                                      return (
                                        <div
                                          key={`${node.key}-${columnName}-${columnIndex}`}
                                          className="rounded-md border border-border/60 bg-card"
                                        >
                                          <div className="px-2 py-1 border-b border-border/50">
                                            <div className="text-[10px] font-mono text-muted-foreground">
                                              @@ column {columnIndex + 1} @@
                                            </div>
                                            <div className="flex items-center gap-2 text-xs mt-0.5">
                                              <span className={cn("w-5 text-center font-mono font-semibold", actionTone(columnChange.action))}>
                                                {actionMarker(columnChange.action)}
                                              </span>
                                              <span className="truncate">{columnTitle}</span>
                                            </div>
                                            <div className="text-[10px] font-mono text-muted-foreground mt-1">
                                              diff --column a/{oldColumnPath} b/{newColumnPath}
                                            </div>
                                          </div>
                                          <div className="px-2 py-2 space-y-1 font-mono text-[11px]">
                                            {columnIdentityLines.map((line, lineIndex) => (
                                              <div key={`${columnName}-identity-${lineIndex}`} className={cn("rounded px-2 py-1", renderLineTone(line))}>
                                                {line.prefix} {toFriendlyLineText(line.text)}
                                                {line.hint ? (
                                                  <span className="ml-2 text-[10px] opacity-80">
                                                    ({resolveHintLabel(line.hint)})
                                                  </span>
                                                ) : null}
                                              </div>
                                            ))}
                                            {columnPropertyDiffs.flatMap((field) =>
                                              buildFieldRenderLines(field.field, field.oldValue, field.newValue, columnChange.action),
                                            ).map((line, lineIndex) => (
                                              <div key={`${columnName}-field-${lineIndex}`} className={cn("rounded px-2 py-1", renderLineTone(line))}>
                                                {line.prefix} {toFriendlyLineText(line.text)}
                                                {line.hint ? (
                                                  <span className="ml-2 text-[10px] opacity-80">
                                                    ({resolveHintLabel(line.hint)})
                                                  </span>
                                                ) : null}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-gradient-to-br from-primary/[0.04] to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("schemaDiff.alter.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.alter.dialect")}</p>
                    <Select value={dialect} onValueChange={(value) => setDialect(value as "mysql" | "oracle")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="oracle">Oracle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.alter.outputMode")}</p>
                    <Select value={outputMode} onValueChange={(value) => setOutputMode(value as "single_table" | "multi_table")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_table">{t("schemaDiff.alter.singleTable")}</SelectItem>
                        <SelectItem value="multi_table">{t("schemaDiff.alter.multiTable")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">{t("schemaDiff.alter.packaging")}</p>
                    <Select value={packaging} onValueChange={(value) => setPackaging(value as "single_file" | "zip")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_file">{t("schemaDiff.alter.singleFile")}</SelectItem>
                        <SelectItem value="zip">ZIP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-md border border-border/70 px-2.5 py-1.5 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{t("schemaDiff.alter.splitBySheet")}</p>
                    <Switch checked={splitBySheet} onCheckedChange={setSplitBySheet} />
                  </div>
                  <div className="rounded-md border border-border/70 px-2.5 py-1.5 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{t("schemaDiff.alter.includeUnconfirmed")}</p>
                    <Switch checked={includeUnconfirmed} onCheckedChange={setIncludeUnconfirmed} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-8 text-xs" onClick={handleGenerateAlterPreview} disabled={alterPreviewMutation.isPending}>
                    {alterPreviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                    {t("schemaDiff.alter.build")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleExportAlter}
                    disabled={alterExportMutation.isPending}
                  >
                    {alterExportMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                    {t("schemaDiff.alter.export")}
                  </Button>
                </div>

                {alterResult ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {t("schemaDiff.alter.artifactsCount", { count: alterResult.artifacts.length })}
                      </Badge>
                      <Select value={selectedArtifactName} onValueChange={setSelectedArtifactName}>
                        <SelectTrigger className="h-7 text-xs max-w-[360px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {alterResult.artifacts.map((artifact) => (
                            <SelectItem key={artifact.artifactName} value={artifact.artifactName}>
                              {artifact.artifactName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      readOnly
                      value={selectedArtifact?.artifactName || ""}
                      className="h-7 text-xs bg-muted/20"
                    />
                    <pre className="max-h-[360px] overflow-auto rounded-md border border-border/60 bg-black/[0.92] p-3 font-mono text-[11px] leading-relaxed selection:bg-primary/30">
                      {selectedArtifact?.sql ? (
                        highlightedAlterTokens.map((token, tokenIndex) => (
                          <span key={`alter-sql-token-${tokenIndex}`} className={SQL_TOKEN_CLASS_MAP[token.type]}>
                            {token.text}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-300">{t("schemaDiff.alter.noSqlPreview")}</span>
                      )}
                    </pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border-border/60 border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground">
              {historyQuery.isLoading ? (
                <div className="inline-flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("schemaDiff.empty.preparingHistory")}
                </div>
              ) : (
                <p className="text-sm">{t("schemaDiff.empty.runDiffHint")}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
