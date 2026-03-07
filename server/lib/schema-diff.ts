import crypto from "crypto";
import { runParseWorkbookBundle } from "./excel-executor";
import { storage } from "../storage";
import type {
  ColumnInfo,
  DiffRenameDecision,
  SchemaDiff,
  SchemaDiffAlterPreviewRequest,
  SchemaDiffAlterPreviewResponse,
  SchemaDiffConfirmRequest,
  SchemaDiffConfirmResponse,
  SchemaDiffHistoryResponse,
  SchemaDiffPreviewRequest,
  SchemaDiffPreviewResponse,
  SchemaDiffRenameSuggestion,
  SchemaDiffSummary,
  SchemaDiffTableChange,
  SchemaDiffThresholds,
  SchemaSnapshot,
  TableInfo,
  UploadedFile,
  VersionLink,
} from "@shared/schema";

interface SnapshotSheet {
  sheetName: string;
  tables: TableInfo[];
}

interface SnapshotPayload {
  fileId: number;
  fileHash: string;
  originalName: string;
  uploadedAt?: string;
  sheets: SnapshotSheet[];
}

interface ScoreBreakdown {
  fileName: number;
  uploadedAt: number;
  content: number;
}

interface CandidateScore {
  file: UploadedFile;
  score: number;
  breakdown: ScoreBreakdown;
  snapshot: SnapshotPayload;
}

interface CandidateQuickScore {
  file: UploadedFile;
  score: number;
}

interface StoredDiffPayload {
  algorithmVersion: string;
  scope: "current_sheet" | "all_sheets";
  sheetName?: string;
  link: SchemaDiffPreviewResponse["link"];
  summary: SchemaDiffSummary;
  sheets: SchemaDiffPreviewResponse["sheets"];
  renameSuggestions: SchemaDiffRenameSuggestion[];
  mcpHints: SchemaDiffPreviewResponse["mcpHints"];
}

const DEFAULT_THRESHOLDS: SchemaDiffThresholds = {
  baselineAutoSelectMin: 0.65,
  tableMatchStrong: 0.8,
  tableRenameCandidate: 0.65,
  columnMatchStrong: 0.8,
  columnRenameCandidate: 0.65,
  ambiguityGap: 0.08,
};

export const SCHEMA_DIFF_ALGORITHM_VERSION = "schema-diff-v2";
const MAX_BASELINE_CANDIDATES = 24;

function normalizeName(input?: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseUploadedAt(uploadedAt?: string | Date | null): number {
  if (!uploadedAt) {
    return 0;
  }
  if (uploadedAt instanceof Date) {
    return uploadedAt.getTime();
  }
  const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const normalized = sqliteUtcPattern.test(uploadedAt)
    ? uploadedAt.replace(" ", "T") + "Z"
    : uploadedAt;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return date.getTime();
}

function toValidUtcDateTimestamp(year: number, month: number, day: number): number | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function extractVersionDateFromFilename(originalName: string): number | null {
  const basename = originalName.replace(/\.[^.]+$/, "");
  const candidates: number[] = [];
  const compactDatePattern = /(?:^|[^0-9])((?:19|20)\d{2})([01]\d)([0-3]\d)(?:[^0-9]|$)/g;
  const separatedDatePattern = /(?:^|[^0-9])((?:19|20)\d{2})[-_.\/]([01]\d)[-_.\/]([0-3]\d)(?:[^0-9]|$)/g;

  for (const match of Array.from(basename.matchAll(compactDatePattern))) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = toValidUtcDateTimestamp(year, month, day);
    if (timestamp !== null) {
      candidates.push(timestamp);
    }
  }

  for (const match of Array.from(basename.matchAll(separatedDatePattern))) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = toValidUtcDateTimestamp(year, month, day);
    if (timestamp !== null) {
      candidates.push(timestamp);
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  return Math.max(...candidates);
}

function resolveVersionTimestamp(file: UploadedFile): number {
  const fromFilename = extractVersionDateFromFilename(file.originalName);
  if (fromFilename !== null) {
    return fromFilename;
  }

  const fromOriginalModifiedAt = parseUploadedAt(file.originalModifiedAt);
  if (fromOriginalModifiedAt > 0) {
    return fromOriginalModifiedAt;
  }

  return parseUploadedAt(file.uploadedAt);
}

function buildStableHash(value: unknown): string {
  const stable = JSON.stringify(value, (_key, data) => {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === "object") {
      const sortedEntries = Object.entries(data as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      return Object.fromEntries(sortedEntries);
    }
    return data;
  });
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function normalizeColumn(column: ColumnInfo): ColumnInfo {
  return {
    no: column.no,
    logicalName: column.logicalName?.trim(),
    physicalName: column.physicalName?.trim(),
    dataType: column.dataType?.trim(),
    size: column.size?.trim(),
    notNull: Boolean(column.notNull),
    isPk: Boolean(column.isPk),
    autoIncrement: Boolean(column.autoIncrement),
    comment: column.comment?.trim(),
  };
}

function normalizeTable(table: TableInfo): TableInfo {
  return {
    logicalTableName: table.logicalTableName?.trim() || "",
    physicalTableName: table.physicalTableName?.trim() || "",
    columns: table.columns
      .map((column) => normalizeColumn(column))
      .sort((a, b) =>
        normalizeName(a.physicalName || a.logicalName).localeCompare(
          normalizeName(b.physicalName || b.logicalName),
        ),
      ),
  };
}

function normalizeSnapshotPayload(
  file: UploadedFile,
  tablesBySheet: Record<string, TableInfo[]>,
): SnapshotPayload {
  const sheets = Object.entries(tablesBySheet)
    .map(([sheetName, tables]) => ({
      sheetName,
      tables: tables.map((table) => normalizeTable(table)).sort((a, b) => {
        const keyA = normalizeName(a.physicalTableName || a.logicalTableName);
        const keyB = normalizeName(b.physicalTableName || b.logicalTableName);
        return keyA.localeCompare(keyB);
      }),
    }))
    .sort((a, b) => a.sheetName.localeCompare(b.sheetName));

  return {
    fileId: file.id,
    fileHash: file.fileHash,
    originalName: file.originalName,
    uploadedAt: file.uploadedAt ?? undefined,
    sheets,
  };
}

function parseSnapshotJson(snapshot: SchemaSnapshot): SnapshotPayload {
  const parsed = JSON.parse(snapshot.snapshotJson) as SnapshotPayload;
  return parsed;
}

async function getOrCreateSnapshot(file: UploadedFile): Promise<{ row: SchemaSnapshot; payload: SnapshotPayload }> {
  const existing = await storage.getSchemaSnapshotByFileId(file.id, SCHEMA_DIFF_ALGORITHM_VERSION);
  if (existing) {
    return { row: existing, payload: parseSnapshotJson(existing) };
  }

  const settings = await storage.getSettings();
  const bundle = await runParseWorkbookBundle(
    file.filePath,
    {
      maxConsecutiveEmptyRows: settings.maxConsecutiveEmptyRows,
      pkMarkers: settings.pkMarkers,
    },
    file.fileHash,
  );
  const payload = normalizeSnapshotPayload(file, bundle.tablesBySheet);
  const snapshotHash = buildStableHash(payload);
  const snapshotJson = JSON.stringify(payload);

  const deduped = await storage.getSchemaSnapshotByHash(snapshotHash, SCHEMA_DIFF_ALGORITHM_VERSION);
  if (deduped) {
    return { row: deduped, payload: parseSnapshotJson(deduped) };
  }

  const created = await storage.createSchemaSnapshot({
    fileId: file.id,
    fileHash: file.fileHash,
    originalName: file.originalName,
    uploadedAt: file.uploadedAt ?? undefined,
    snapshotHash,
    algorithmVersion: SCHEMA_DIFF_ALGORITHM_VERSION,
    snapshotJson,
  });
  return { row: created, payload };
}

function bigramSimilarity(left?: string, right?: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a && !b) {
    return 1;
  }
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  const toBigrams = (input: string): string[] => {
    if (input.length < 2) {
      return [input];
    }
    const result: string[] = [];
    for (let index = 0; index < input.length - 1; index += 1) {
      result.push(input.slice(index, index + 2));
    }
    return result;
  };
  const gramsA = toBigrams(a);
  const gramsB = toBigrams(b);
  const counts = new Map<string, number>();
  gramsA.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1));
  let overlap = 0;
  gramsB.forEach((gram) => {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  });
  return (2 * overlap) / (gramsA.length + gramsB.length);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  const intersection = Array.from(left).filter((value) => right.has(value)).length;
  const union = new Set([...Array.from(left), ...Array.from(right)]).size;
  if (union === 0) {
    return 0;
  }
  return intersection / union;
}

function buildSnapshotTableSignatures(snapshot: SnapshotPayload): Set<string> {
  const values = new Set<string>();
  snapshot.sheets.forEach((sheet) => {
    sheet.tables.forEach((table) => {
      const columns = table.columns
        .map((column) => normalizeName(column.physicalName || column.logicalName))
        .filter(Boolean)
        .sort()
        .join(",");
      values.add(`${normalizeName(sheet.sheetName)}|${normalizeName(table.physicalTableName)}|${columns}`);
    });
  });
  return values;
}

function pickCandidatePool(newFile: UploadedFile, files: UploadedFile[]): UploadedFile[] {
  return files.filter((file) => file.id !== newFile.id);
}

function rankCandidatesQuickly(newFile: UploadedFile, candidates: UploadedFile[]): UploadedFile[] {
  if (candidates.length <= MAX_BASELINE_CANDIDATES) {
    return candidates;
  }

  const newTime = resolveVersionTimestamp(newFile);
  const maxTimeDistance = Math.max(
    1,
    ...candidates.map((file) => Math.abs(newTime - resolveVersionTimestamp(file))),
  );

  const quickScores: CandidateQuickScore[] = candidates.map((file) => {
    const fileNameScore = bigramSimilarity(file.originalName, newFile.originalName);
    const timeDistance = Math.abs(newTime - resolveVersionTimestamp(file));
    const uploadedAtScore = Math.max(0, 1 - timeDistance / maxTimeDistance);
    return {
      file,
      score: 0.7 * fileNameScore + 0.3 * uploadedAtScore,
    };
  });

  quickScores.sort((left, right) => right.score - left.score);
  return quickScores.slice(0, MAX_BASELINE_CANDIDATES).map((item) => item.file);
}

async function scoreBaselineCandidates(
  newFile: UploadedFile,
  newSnapshot: SnapshotPayload,
  candidates: UploadedFile[],
): Promise<CandidateScore[]> {
  if (candidates.length === 0) {
    return [];
  }

  const newTime = resolveVersionTimestamp(newFile);
  const tableSignaturesNew = buildSnapshotTableSignatures(newSnapshot);
  const maxTimeDistance = Math.max(
    1,
    ...candidates.map((file) => Math.abs(newTime - resolveVersionTimestamp(file))),
  );

  const scored: CandidateScore[] = [];

  for (const candidate of candidates) {
    const { payload } = await getOrCreateSnapshot(candidate);
    const fileNameScore = bigramSimilarity(candidate.originalName, newFile.originalName);
    const timeDistance = Math.abs(newTime - resolveVersionTimestamp(candidate));
    const uploadedAtScore = Math.max(0, 1 - timeDistance / maxTimeDistance);
    const contentScore = jaccardSimilarity(
      tableSignaturesNew,
      buildSnapshotTableSignatures(payload),
    );
    const score = 0.35 * fileNameScore + 0.25 * uploadedAtScore + 0.4 * contentScore;
    scored.push({
      file: candidate,
      score,
      breakdown: {
        fileName: fileNameScore,
        uploadedAt: uploadedAtScore,
        content: contentScore,
      },
      snapshot: payload,
    });
  }

  scored.sort((left, right) => right.score - left.score);
  return scored;
}

function pickLatestBaselineCandidate(newFile: UploadedFile, candidates: UploadedFile[]): UploadedFile | null {
  if (candidates.length === 0) {
    return null;
  }
  const newVersionTs = resolveVersionTimestamp(newFile);
  const withVersionTs = candidates.map((file) => ({
    file,
    versionTs: resolveVersionTimestamp(file),
  }));
  const olderOrEqual = withVersionTs.filter((item) => item.versionTs <= newVersionTs);
  const targetPool = olderOrEqual.length > 0 ? olderOrEqual : withVersionTs;
  targetPool.sort((left, right) => {
    if (left.versionTs !== right.versionTs) {
      return right.versionTs - left.versionTs;
    }
    return right.file.id - left.file.id;
  });
  return targetPool[0]?.file ?? null;
}

function resolveAutoBaselineCandidate(
  newFile: UploadedFile,
  scored: CandidateScore[],
  thresholds: SchemaDiffThresholds,
): CandidateScore | null {
  if (scored.length === 0) {
    return null;
  }

  const latestCandidate = pickLatestBaselineCandidate(
    newFile,
    scored.map((item) => item.file),
  );
  if (!latestCandidate) {
    return scored[0];
  }

  const latestScored = scored.find((item) => item.file.id === latestCandidate.id);
  if (!latestScored) {
    return scored[0];
  }

  const minimumAcceptedScore = Math.max(0.3, thresholds.baselineAutoSelectMin * 0.55);
  if (latestScored.score >= minimumAcceptedScore) {
    return latestScored;
  }
  return scored[0];
}

function buildTableColumnNameSet(table?: TableInfo): Set<string> {
  const set = new Set<string>();
  (table?.columns ?? []).forEach((column) => {
    const value = normalizeName(column.physicalName || column.logicalName);
    if (value) {
      set.add(value);
    }
  });
  return set;
}

function scoreTableSimilarity(oldTable: TableInfo, newTable: TableInfo): number {
  const physicalScore = bigramSimilarity(oldTable.physicalTableName, newTable.physicalTableName);
  const logicalScore = bigramSimilarity(oldTable.logicalTableName, newTable.logicalTableName);
  const columnScore = jaccardSimilarity(buildTableColumnNameSet(oldTable), buildTableColumnNameSet(newTable));
  const commentScore = bigramSimilarity(
    oldTable.columns.map((column) => column.comment || "").join("|"),
    newTable.columns.map((column) => column.comment || "").join("|"),
  );
  return 0.35 * physicalScore + 0.25 * logicalScore + 0.3 * columnScore + 0.1 * commentScore;
}

function scoreColumnSimilarity(oldColumn: ColumnInfo, newColumn: ColumnInfo): number {
  const physicalScore = bigramSimilarity(oldColumn.physicalName, newColumn.physicalName);
  const logicalScore = bigramSimilarity(oldColumn.logicalName, newColumn.logicalName);
  const typeScore = oldColumn.dataType === newColumn.dataType && oldColumn.size === newColumn.size ? 1 : 0;
  const constraintsScore =
    oldColumn.notNull === newColumn.notNull && oldColumn.isPk === newColumn.isPk ? 1 : 0;
  const commentScore = bigramSimilarity(oldColumn.comment, newColumn.comment);
  return (
    0.45 * physicalScore +
    0.2 * logicalScore +
    0.2 * typeScore +
    0.1 * constraintsScore +
    0.05 * commentScore
  );
}

function collectColumnChangedFields(oldColumn: ColumnInfo, newColumn: ColumnInfo): string[] {
  const changedFields: string[] = [];
  if (oldColumn.logicalName !== newColumn.logicalName) changedFields.push("logicalName");
  if (oldColumn.physicalName !== newColumn.physicalName) changedFields.push("physicalName");
  if (oldColumn.dataType !== newColumn.dataType) changedFields.push("dataType");
  if (oldColumn.size !== newColumn.size) changedFields.push("size");
  if (Boolean(oldColumn.notNull) !== Boolean(newColumn.notNull)) changedFields.push("notNull");
  if (Boolean(oldColumn.isPk) !== Boolean(newColumn.isPk)) changedFields.push("isPk");
  if (Boolean(oldColumn.autoIncrement) !== Boolean(newColumn.autoIncrement)) changedFields.push("autoIncrement");
  if ((oldColumn.comment ?? "") !== (newColumn.comment ?? "")) changedFields.push("comment");
  return changedFields;
}

function collectTableChangedFields(oldTable: TableInfo, newTable: TableInfo): string[] {
  const changedFields: string[] = [];
  if (oldTable.logicalTableName !== newTable.logicalTableName) changedFields.push("logicalTableName");
  if (oldTable.physicalTableName !== newTable.physicalTableName) changedFields.push("physicalTableName");
  return changedFields;
}

function matchPairs(
  oldLength: number,
  newLength: number,
  getScore: (oldIndex: number, newIndex: number) => number,
  minScore: number,
): Array<{ oldIndex: number; newIndex: number; score: number }> {
  const candidates: Array<{ oldIndex: number; newIndex: number; score: number }> = [];
  for (let oldIndex = 0; oldIndex < oldLength; oldIndex += 1) {
    for (let newIndex = 0; newIndex < newLength; newIndex += 1) {
      const score = getScore(oldIndex, newIndex);
      if (score >= minScore) {
        candidates.push({ oldIndex, newIndex, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  const matched: Array<{ oldIndex: number; newIndex: number; score: number }> = [];
  candidates.forEach((candidate) => {
    if (usedOld.has(candidate.oldIndex) || usedNew.has(candidate.newIndex)) {
      return;
    }
    usedOld.add(candidate.oldIndex);
    usedNew.add(candidate.newIndex);
    matched.push(candidate);
  });
  return matched;
}

function buildIndexRange(length: number): number[] {
  return Array.from({ length }, (_value, index) => index);
}

function matchExactByKey(
  oldIndices: number[],
  newIndices: number[],
  getOldKey: (oldIndex: number) => string,
  getNewKey: (newIndex: number) => string,
  getScore: (oldIndex: number, newIndex: number) => number,
): Array<{ oldIndex: number; newIndex: number; score: number }> {
  const newIndexMap = new Map<string, number[]>();

  newIndices.forEach((newIndex) => {
    const key = getNewKey(newIndex);
    if (!key) {
      return;
    }
    const list = newIndexMap.get(key) ?? [];
    list.push(newIndex);
    newIndexMap.set(key, list);
  });

  const matched: Array<{ oldIndex: number; newIndex: number; score: number }> = [];
  oldIndices.forEach((oldIndex) => {
    const key = getOldKey(oldIndex);
    if (!key) {
      return;
    }
    const list = newIndexMap.get(key);
    if (!list || list.length === 0) {
      return;
    }
    const newIndex = list.shift()!;
    matched.push({
      oldIndex,
      newIndex,
      score: getScore(oldIndex, newIndex),
    });
  });

  return matched;
}

function buildTableRenameEntityKey(sheetName: string, oldTableName: string, newTableName: string): string {
  return `table:${sheetName}:${normalizeName(oldTableName)}->${normalizeName(newTableName)}`;
}

function buildColumnRenameEntityKey(
  sheetName: string,
  tableName: string,
  oldColumnName: string,
  newColumnName: string,
): string {
  return `column:${sheetName}:${normalizeName(tableName)}:${normalizeName(oldColumnName)}->${normalizeName(
    newColumnName,
  )}`;
}

function diffColumns(
  sheetName: string,
  tableBefore: TableInfo,
  tableAfter: TableInfo,
  thresholds: SchemaDiffThresholds,
): { changes: SchemaDiffTableChange["columnChanges"]; renameSuggestions: SchemaDiffRenameSuggestion[] } {
  const oldColumns = tableBefore.columns;
  const newColumns = tableAfter.columns;
  const initialOldIndices = buildIndexRange(oldColumns.length);
  const initialNewIndices = buildIndexRange(newColumns.length);
  const matched: Array<{ oldIndex: number; newIndex: number; score: number }> = [];

  const exactPhysicalMatches = matchExactByKey(
    initialOldIndices,
    initialNewIndices,
    (oldIndex) => normalizeName(oldColumns[oldIndex].physicalName),
    (newIndex) => normalizeName(newColumns[newIndex].physicalName),
    (oldIndex, newIndex) => scoreColumnSimilarity(oldColumns[oldIndex], newColumns[newIndex]),
  );
  matched.push(...exactPhysicalMatches);

  const matchedOldAfterPhysical = new Set(matched.map((item) => item.oldIndex));
  const matchedNewAfterPhysical = new Set(matched.map((item) => item.newIndex));
  const oldIndicesAfterPhysical = initialOldIndices.filter((index) => !matchedOldAfterPhysical.has(index));
  const newIndicesAfterPhysical = initialNewIndices.filter((index) => !matchedNewAfterPhysical.has(index));

  const exactLogicalMatches = matchExactByKey(
    oldIndicesAfterPhysical,
    newIndicesAfterPhysical,
    (oldIndex) =>
      normalizeName(oldColumns[oldIndex].physicalName)
        ? ""
        : normalizeName(oldColumns[oldIndex].logicalName),
    (newIndex) =>
      normalizeName(newColumns[newIndex].physicalName)
        ? ""
        : normalizeName(newColumns[newIndex].logicalName),
    (oldIndex, newIndex) => scoreColumnSimilarity(oldColumns[oldIndex], newColumns[newIndex]),
  );
  matched.push(...exactLogicalMatches);

  const matchedOldAfterExact = new Set(matched.map((item) => item.oldIndex));
  const matchedNewAfterExact = new Set(matched.map((item) => item.newIndex));
  const oldIndicesForFuzzy = initialOldIndices.filter((index) => !matchedOldAfterExact.has(index));
  const newIndicesForFuzzy = initialNewIndices.filter((index) => !matchedNewAfterExact.has(index));

  const fuzzyMatches = matchPairs(
    oldIndicesForFuzzy.length,
    newIndicesForFuzzy.length,
    (oldIndex, newIndex) =>
      scoreColumnSimilarity(oldColumns[oldIndicesForFuzzy[oldIndex]], newColumns[newIndicesForFuzzy[newIndex]]),
    thresholds.columnRenameCandidate,
  ).map((pair) => ({
    oldIndex: oldIndicesForFuzzy[pair.oldIndex],
    newIndex: newIndicesForFuzzy[pair.newIndex],
    score: pair.score,
  }));
  matched.push(...fuzzyMatches);

  const matchedOld = new Set(matched.map((item) => item.oldIndex));
  const matchedNew = new Set(matched.map((item) => item.newIndex));
  const changes: SchemaDiffTableChange["columnChanges"] = [];
  const suggestions: SchemaDiffRenameSuggestion[] = [];

  matched.forEach((pair) => {
    const oldColumn = oldColumns[pair.oldIndex];
    const newColumn = newColumns[pair.newIndex];
    const changedFields = collectColumnChangedFields(oldColumn, newColumn);
    const oldName = normalizeName(oldColumn.physicalName);
    const newName = normalizeName(newColumn.physicalName);
    const isRename = oldName !== "" && newName !== "" && oldName !== newName;

    if (isRename && pair.score >= thresholds.columnRenameCandidate) {
      const entityKey = buildColumnRenameEntityKey(
        sheetName,
        tableBefore.physicalTableName || tableAfter.physicalTableName,
        oldColumn.physicalName || oldColumn.logicalName || "column",
        newColumn.physicalName || newColumn.logicalName || "column",
      );
      changes.push({
        action: "rename_suggest",
        confidence: pair.score,
        requiresConfirmation: true,
        entityKey,
        oldColumn,
        newColumn,
        changedFields,
      });
      suggestions.push({
        entityType: "column",
        entityKey,
        confidence: pair.score,
        sheetName,
        tableNameBefore: tableBefore.physicalTableName,
        tableNameAfter: tableAfter.physicalTableName,
        columnNameBefore: oldColumn.physicalName ?? oldColumn.logicalName,
        columnNameAfter: newColumn.physicalName ?? newColumn.logicalName,
        decision: "pending",
      });
      return;
    }

    if (changedFields.length > 0) {
      changes.push({
        action: "modified",
        requiresConfirmation: false,
        confidence: pair.score,
        oldColumn,
        newColumn,
        changedFields,
      });
    }
  });

  oldColumns.forEach((oldColumn, oldIndex) => {
    if (!matchedOld.has(oldIndex)) {
      changes.push({
        action: "removed",
        requiresConfirmation: false,
        oldColumn,
        changedFields: [],
      });
    }
  });
  newColumns.forEach((newColumn, newIndex) => {
    if (!matchedNew.has(newIndex)) {
      changes.push({
        action: "added",
        requiresConfirmation: false,
        newColumn,
        changedFields: [],
      });
    }
  });

  return { changes, renameSuggestions: suggestions };
}

function diffSheetTables(
  sheetName: string,
  oldTables: TableInfo[],
  newTables: TableInfo[],
  thresholds: SchemaDiffThresholds,
): { tableChanges: SchemaDiffPreviewResponse["sheets"][number]["tableChanges"]; renameSuggestions: SchemaDiffRenameSuggestion[] } {
  const initialOldIndices = buildIndexRange(oldTables.length);
  const initialNewIndices = buildIndexRange(newTables.length);
  const matched: Array<{ oldIndex: number; newIndex: number; score: number }> = [];

  const exactPhysicalMatches = matchExactByKey(
    initialOldIndices,
    initialNewIndices,
    (oldIndex) => normalizeName(oldTables[oldIndex].physicalTableName),
    (newIndex) => normalizeName(newTables[newIndex].physicalTableName),
    (oldIndex, newIndex) => scoreTableSimilarity(oldTables[oldIndex], newTables[newIndex]),
  );
  matched.push(...exactPhysicalMatches);

  const matchedOldAfterPhysical = new Set(matched.map((pair) => pair.oldIndex));
  const matchedNewAfterPhysical = new Set(matched.map((pair) => pair.newIndex));
  const oldIndicesAfterPhysical = initialOldIndices.filter((index) => !matchedOldAfterPhysical.has(index));
  const newIndicesAfterPhysical = initialNewIndices.filter((index) => !matchedNewAfterPhysical.has(index));

  const exactLogicalMatches = matchExactByKey(
    oldIndicesAfterPhysical,
    newIndicesAfterPhysical,
    (oldIndex) =>
      normalizeName(oldTables[oldIndex].physicalTableName)
        ? ""
        : normalizeName(oldTables[oldIndex].logicalTableName),
    (newIndex) =>
      normalizeName(newTables[newIndex].physicalTableName)
        ? ""
        : normalizeName(newTables[newIndex].logicalTableName),
    (oldIndex, newIndex) => scoreTableSimilarity(oldTables[oldIndex], newTables[newIndex]),
  );
  matched.push(...exactLogicalMatches);

  const matchedOldAfterExact = new Set(matched.map((pair) => pair.oldIndex));
  const matchedNewAfterExact = new Set(matched.map((pair) => pair.newIndex));
  const oldIndicesForFuzzy = initialOldIndices.filter((index) => !matchedOldAfterExact.has(index));
  const newIndicesForFuzzy = initialNewIndices.filter((index) => !matchedNewAfterExact.has(index));

  const fuzzyMatches = matchPairs(
    oldIndicesForFuzzy.length,
    newIndicesForFuzzy.length,
    (oldIndex, newIndex) =>
      scoreTableSimilarity(oldTables[oldIndicesForFuzzy[oldIndex]], newTables[newIndicesForFuzzy[newIndex]]),
    thresholds.tableRenameCandidate,
  ).map((pair) => ({
    oldIndex: oldIndicesForFuzzy[pair.oldIndex],
    newIndex: newIndicesForFuzzy[pair.newIndex],
    score: pair.score,
  }));
  matched.push(...fuzzyMatches);

  const matchedOld = new Set(matched.map((pair) => pair.oldIndex));
  const matchedNew = new Set(matched.map((pair) => pair.newIndex));
  const tableChanges: SchemaDiffPreviewResponse["sheets"][number]["tableChanges"] = [];
  const renameSuggestions: SchemaDiffRenameSuggestion[] = [];

  matched.forEach((pair) => {
    const oldTable = oldTables[pair.oldIndex];
    const newTable = newTables[pair.newIndex];
    const changedFields = collectTableChangedFields(oldTable, newTable);
    const { changes: columnChanges, renameSuggestions: columnRenameSuggestions } = diffColumns(
      sheetName,
      oldTable,
      newTable,
      thresholds,
    );
    renameSuggestions.push(...columnRenameSuggestions);

    const oldName = normalizeName(oldTable.physicalTableName);
    const newName = normalizeName(newTable.physicalTableName);
    const isRename = oldName !== "" && newName !== "" && oldName !== newName;
    const tableHasChanges = changedFields.length > 0 || columnChanges.length > 0;
    if (!tableHasChanges) {
      return;
    }

    if (isRename && pair.score >= thresholds.tableRenameCandidate) {
      const entityKey = buildTableRenameEntityKey(
        sheetName,
        oldTable.physicalTableName || oldTable.logicalTableName || "table",
        newTable.physicalTableName || newTable.logicalTableName || "table",
      );
      tableChanges.push({
        action: "rename_suggest",
        confidence: pair.score,
        requiresConfirmation: true,
        entityKey,
        oldTable,
        newTable,
        changedFields,
        columnChanges,
      });
      renameSuggestions.push({
        entityType: "table",
        entityKey,
        confidence: pair.score,
        sheetName,
        tableNameBefore: oldTable.physicalTableName || oldTable.logicalTableName,
        tableNameAfter: newTable.physicalTableName || newTable.logicalTableName,
        decision: "pending",
      });
      return;
    }

    tableChanges.push({
      action: "changed",
      requiresConfirmation: false,
      confidence: pair.score,
      oldTable,
      newTable,
      changedFields,
      columnChanges,
    });
  });

  oldTables.forEach((table, oldIndex) => {
    if (!matchedOld.has(oldIndex)) {
      tableChanges.push({
        action: "removed",
        requiresConfirmation: false,
        oldTable: table,
        changedFields: [],
        columnChanges: [],
      });
    }
  });
  newTables.forEach((table, newIndex) => {
    if (!matchedNew.has(newIndex)) {
      tableChanges.push({
        action: "added",
        requiresConfirmation: false,
        newTable: table,
        changedFields: [],
        columnChanges: [],
      });
    }
  });

  return { tableChanges, renameSuggestions };
}

function calculateSummary(
  sheets: SchemaDiffPreviewResponse["sheets"],
  suggestions: SchemaDiffRenameSuggestion[],
): SchemaDiffSummary {
  const summary: SchemaDiffSummary = {
    addedTables: 0,
    removedTables: 0,
    changedTables: 0,
    renameSuggestions: suggestions.length,
    pendingConfirmations: suggestions.filter((item) => item.decision === "pending").length,
    addedColumns: 0,
    removedColumns: 0,
    changedColumns: 0,
  };

  sheets.forEach((sheet) => {
    sheet.tableChanges.forEach((tableChange) => {
      if (tableChange.action === "added") summary.addedTables += 1;
      if (tableChange.action === "removed") summary.removedTables += 1;
      if (tableChange.action === "changed" || tableChange.action === "renamed") summary.changedTables += 1;
      tableChange.columnChanges.forEach((columnChange) => {
        if (columnChange.action === "added") summary.addedColumns += 1;
        if (columnChange.action === "removed") summary.removedColumns += 1;
        if (
          columnChange.action === "modified" ||
          columnChange.action === "rename_suggest" ||
          columnChange.action === "renamed"
        ) {
          summary.changedColumns += 1;
        }
      });
    });
  });

  return summary;
}

function buildMcpHints(
  sheets: SchemaDiffPreviewResponse["sheets"],
  suggestions: SchemaDiffRenameSuggestion[],
): SchemaDiffPreviewResponse["mcpHints"] {
  const changedTables: SchemaDiffPreviewResponse["mcpHints"]["changedTables"] = [];
  const changedColumns: SchemaDiffPreviewResponse["mcpHints"]["changedColumns"] = [];
  const impactKeywords = new Set<string>();

  sheets.forEach((sheet) => {
    sheet.tableChanges.forEach((tableChange) => {
      const tableName =
        tableChange.newTable?.physicalTableName ??
        tableChange.oldTable?.physicalTableName ??
        tableChange.newTable?.logicalTableName ??
        tableChange.oldTable?.logicalTableName;
      changedTables.push({
        sheetName: sheet.sheetName,
        action: tableChange.action,
        tableName,
        confidence: tableChange.confidence,
        requiresConfirmation: Boolean(tableChange.requiresConfirmation),
      });
      if (tableName) {
        impactKeywords.add(`table:${tableName}`);
      }
      tableChange.columnChanges.forEach((columnChange) => {
        const columnName =
          columnChange.newColumn?.physicalName ??
          columnChange.oldColumn?.physicalName ??
          columnChange.newColumn?.logicalName ??
          columnChange.oldColumn?.logicalName;
        changedColumns.push({
          sheetName: sheet.sheetName,
          tableName,
          action: columnChange.action,
          columnName,
          confidence: columnChange.confidence,
          requiresConfirmation: Boolean(columnChange.requiresConfirmation),
        });
        if (columnName) {
          impactKeywords.add(`column:${columnName}`);
        }
      });
    });
  });

  const hasPendingSuggestions = suggestions.some((item) => item.decision === "pending");

  if (hasPendingSuggestions) {
    impactKeywords.add("rename:pending_confirmation");
  }

  return {
    changedTables,
    changedColumns,
    impactKeywords: Array.from(impactKeywords).sort(),
    nextActions:
      hasPendingSuggestions
        ? [
            "Review rename suggestions and confirm accept/reject.",
            "Re-run ALTER preview after confirmations.",
          ]
        : ["No rename confirmations pending.", "Proceed to ALTER preview/export."],
  };
}

function getSheetTables(snapshot: SnapshotPayload, sheetName: string): TableInfo[] {
  return snapshot.sheets.find((sheet) => sheet.sheetName === sheetName)?.tables ?? [];
}

function buildTableIdentitySet(tables: TableInfo[]): Set<string> {
  const values = new Set<string>();
  tables.forEach((table) => {
    const tableName = normalizeName(table.physicalTableName || table.logicalTableName);
    if (tableName) {
      values.add(tableName);
    }
  });
  return values;
}

function resolveCurrentSheetBaselineName(
  requestedSheetName: string,
  newSnapshot: SnapshotPayload,
  oldSnapshot: SnapshotPayload,
): string {
  const exactExists = oldSnapshot.sheets.some((sheet) => sheet.sheetName === requestedSheetName);
  if (exactExists) {
    return requestedSheetName;
  }

  const newTables = getSheetTables(newSnapshot, requestedSheetName);
  if (newTables.length === 0) {
    return requestedSheetName;
  }

  const newTableSet = buildTableIdentitySet(newTables);
  let bestSheetName = requestedSheetName;
  let bestScore = 0;

  oldSnapshot.sheets.forEach((sheet) => {
    const oldTableSet = buildTableIdentitySet(sheet.tables);
    const tableOverlapScore = jaccardSimilarity(newTableSet, oldTableSet);
    const sheetNameScore = bigramSimilarity(requestedSheetName, sheet.sheetName);
    const totalScore = 0.75 * tableOverlapScore + 0.25 * sheetNameScore;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSheetName = sheet.sheetName;
    }
  });

  return bestScore >= 0.2 ? bestSheetName : requestedSheetName;
}

function resolveThresholds(overrides?: Partial<SchemaDiffThresholds>): SchemaDiffThresholds {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(overrides ?? {}),
  };
}

function buildOptionsHash(input: {
  scope: "current_sheet" | "all_sheets";
  sheetName?: string;
  thresholds: SchemaDiffThresholds;
}): string {
  return buildStableHash(input);
}

async function selectBaselineFile(
  request: SchemaDiffPreviewRequest,
  newFile: UploadedFile,
  newSnapshot: SnapshotPayload,
  thresholds: SchemaDiffThresholds,
): Promise<{ oldFile: UploadedFile; link: SchemaDiffPreviewResponse["link"] }> {
  if (request.mode === "manual") {
    const oldFile = await storage.getUploadedFile(request.oldFileId!);
    if (!oldFile) {
      throw new Error("Selected baseline file does not exist");
    }
    await storage.upsertVersionLink({
      newFileId: newFile.id,
      oldFileId: oldFile.id,
      selectionMode: "manual",
      confidence: 1,
      scoreBreakdownJson: undefined,
    });
    return {
      oldFile,
      link: {
        newFileId: newFile.id,
        oldFileId: oldFile.id,
        mode: "manual",
        confidence: 1,
        lowConfidence: false,
      },
    };
  }

  const allFiles = await storage.getUploadedFiles();
  const candidatePool = pickCandidatePool(newFile, allFiles);
  if (candidatePool.length === 0) {
    throw new Error("No historical file found for automatic baseline matching");
  }

  const shortlistedCandidates = rankCandidatesQuickly(newFile, candidatePool);
  const scored = await scoreBaselineCandidates(newFile, newSnapshot, shortlistedCandidates);
  const selected = resolveAutoBaselineCandidate(newFile, scored, thresholds);
  if (!selected) {
    throw new Error("No baseline candidate available");
  }
  const lowConfidence = selected.score < thresholds.baselineAutoSelectMin;

  await storage.upsertVersionLink({
    newFileId: newFile.id,
    oldFileId: selected.file.id,
    selectionMode: "auto",
    confidence: selected.score,
    scoreBreakdownJson: JSON.stringify(selected.breakdown),
  });

  return {
    oldFile: selected.file,
    link: {
      newFileId: newFile.id,
      oldFileId: selected.file.id,
      mode: "auto",
      confidence: selected.score,
      lowConfidence,
      scoreBreakdown: selected.breakdown,
    },
  };
}

function buildCacheKey(input: {
  newSnapshotHash: string;
  oldSnapshotHash: string;
  scope: "current_sheet" | "all_sheets";
  sheetName?: string;
  optionsHash: string;
}): string {
  return buildStableHash({
    ...input,
    algorithmVersion: SCHEMA_DIFF_ALGORITHM_VERSION,
  });
}

function loadStoredDiffPayload(diff: SchemaDiff): StoredDiffPayload {
  return JSON.parse(diff.diffJson) as StoredDiffPayload;
}

function applyRenameDecisions(
  payload: StoredDiffPayload,
  decisions: Map<string, DiffRenameDecision["decision"]>,
): StoredDiffPayload {
  const cloned = JSON.parse(JSON.stringify(payload)) as StoredDiffPayload;
  cloned.renameSuggestions = cloned.renameSuggestions.map((suggestion) => ({
    ...suggestion,
    decision: decisions.get(suggestion.entityKey) ?? suggestion.decision,
  }));

  cloned.sheets.forEach((sheet) => {
    sheet.tableChanges.forEach((tableChange) => {
      if (tableChange.entityKey && tableChange.action === "rename_suggest") {
        const decision = decisions.get(tableChange.entityKey);
        if (decision === "accept") {
          tableChange.action = "renamed";
          tableChange.requiresConfirmation = false;
        } else if (decision === "reject") {
          tableChange.requiresConfirmation = false;
        }
      }
      tableChange.columnChanges.forEach((columnChange) => {
        if (columnChange.entityKey && columnChange.action === "rename_suggest") {
          const decision = decisions.get(columnChange.entityKey);
          if (decision === "accept") {
            columnChange.action = "renamed";
            columnChange.requiresConfirmation = false;
          } else if (decision === "reject") {
            columnChange.requiresConfirmation = false;
          }
        }
      });
    });
  });

  cloned.summary = calculateSummary(cloned.sheets, cloned.renameSuggestions);
  cloned.mcpHints = buildMcpHints(cloned.sheets, cloned.renameSuggestions);
  return cloned;
}

function resolveColumnType(column: ColumnInfo, dialect: "mysql" | "oracle"): string {
  const type = (column.dataType || "").trim().toLowerCase();
  const size = (column.size || "").trim();
  if (dialect === "mysql") {
    if (!type) return "varchar(255)";
    if (type === "varchar" || type === "char") return `${type}(${size || "255"})`;
    if (type === "int" || type === "integer") return size ? `int(${size})` : "int";
    if (type === "bigint" || type === "tinyint" || type === "smallint") return size ? `${type}(${size})` : type;
    if (type === "decimal" || type === "numeric") return `decimal(${size || "10,2"})`;
    if (type === "datetime" || type === "timestamp") return size ? `${type}(${size})` : type;
    return size ? `${type}(${size})` : type;
  }

  if (!type) return "VARCHAR2(255)";
  if (type === "varchar") return `VARCHAR2(${size || "255"})`;
  if (type === "char") return `CHAR(${size || "1"})`;
  if (type === "int" || type === "integer" || type === "bigint" || type === "smallint" || type === "tinyint") {
    return size ? `NUMBER(${size})` : "NUMBER";
  }
  if (type === "decimal" || type === "numeric") return `NUMBER(${size || "10,2"})`;
  if (type === "datetime") return "TIMESTAMP";
  if (type === "text" || type === "longtext" || type === "mediumtext") return "CLOB";
  return size ? `${type.toUpperCase()}(${size})` : type.toUpperCase();
}

function resolveColumnDefinition(column: ColumnInfo, dialect: "mysql" | "oracle"): string {
  const columnName = column.physicalName || column.logicalName || "unknown_column";
  const type = resolveColumnType(column, dialect);
  const notNull = column.notNull ? " NOT NULL" : "";
  const normalizedType = (column.dataType || "").trim().toLowerCase();
  const canUseAutoIncrement =
    dialect === "mysql" &&
    Boolean(column.autoIncrement) &&
    Boolean(column.isPk) &&
    (normalizedType === "int" ||
      normalizedType === "integer" ||
      normalizedType === "bigint" ||
      normalizedType === "tinyint" ||
      normalizedType === "smallint" ||
      normalizedType === "mediumint");
  const autoIncrement = canUseAutoIncrement ? " AUTO_INCREMENT" : "";
  if (dialect === "mysql") {
    return `\`${columnName}\` ${type}${notNull}${autoIncrement}`;
  }
  return `${columnName} ${type}${notNull}`;
}

function hasDefinitionLevelColumnChanges(changedFields: string[]): boolean {
  return changedFields.some((field) => field === "dataType" || field === "size" || field === "notNull" || field === "autoIncrement");
}

function quoteTableName(tableName: string, dialect: "mysql" | "oracle"): string {
  return dialect === "mysql" ? `\`${tableName}\`` : tableName;
}

function quoteColumnName(columnName: string, dialect: "mysql" | "oracle"): string {
  return dialect === "mysql" ? `\`${columnName}\`` : columnName;
}

function buildCreateTableStatement(table: TableInfo, dialect: "mysql" | "oracle"): string {
  const tableName = table.physicalTableName || table.logicalTableName || "unknown_table";
  const columnDefinitions = table.columns
    .map((column) => resolveColumnDefinition(column, dialect))
    .filter((definition) => definition.trim() !== "");

  if (columnDefinitions.length === 0) {
    return `-- Skip CREATE TABLE ${tableName}: no columns detected`;
  }

  const pkColumns = table.columns
    .filter((column) => column.isPk)
    .map((column) => column.physicalName || column.logicalName || "unknown_pk");

  if (pkColumns.length > 0) {
    const pkSql = pkColumns.map((columnName) => quoteColumnName(columnName, dialect)).join(", ");
    columnDefinitions.push(`PRIMARY KEY (${pkSql})`);
  }

  const body = columnDefinitions.map((line) => `  ${line}`).join(",\n");
  return `CREATE TABLE ${quoteTableName(tableName, dialect)} (\n${body}\n);`;
}

function buildAlterStatementsForTableChange(
  tableChange: SchemaDiffTableChange,
  dialect: "mysql" | "oracle",
  decisionMap: Map<string, DiffRenameDecision["decision"]>,
  includeUnconfirmed: boolean,
): string[] {
  const statements: string[] = [];
  const tableBefore = tableChange.oldTable?.physicalTableName || tableChange.oldTable?.logicalTableName;
  const tableAfter = tableChange.newTable?.physicalTableName || tableChange.newTable?.logicalTableName;

  if (tableChange.action === "added" && tableChange.newTable) {
    statements.push(buildCreateTableStatement(tableChange.newTable, dialect));
    return statements;
  }

  if (tableChange.action === "removed" && tableBefore) {
    statements.push(`DROP TABLE ${quoteTableName(tableBefore, dialect)};`);
    return statements;
  }

  if (tableChange.action === "rename_suggest") {
    const decision = tableChange.entityKey ? decisionMap.get(tableChange.entityKey) : "pending";
    if (decision === "accept" && tableBefore && tableAfter) {
      if (dialect === "mysql") {
        statements.push(`RENAME TABLE ${quoteTableName(tableBefore, dialect)} TO ${quoteTableName(tableAfter, dialect)};`);
      } else {
        statements.push(`ALTER TABLE ${quoteTableName(tableBefore, dialect)} RENAME TO ${quoteTableName(tableAfter, dialect)};`);
      }
    } else if (decision === "reject" && tableBefore && tableAfter) {
      statements.push(`DROP TABLE ${quoteTableName(tableBefore, dialect)};`);
      if (tableChange.newTable) {
        statements.push(buildCreateTableStatement(tableChange.newTable, dialect));
      }
      return statements;
    } else if (includeUnconfirmed && tableBefore && tableAfter) {
      statements.push(`-- TODO(confirm rename): ${tableBefore} -> ${tableAfter}`);
    }
  }

  const targetTableName = tableAfter || tableBefore;
  if (!targetTableName) {
    return statements;
  }

  const resolvedTableName =
    tableChange.action === "rename_suggest" && tableChange.entityKey
      ? decisionMap.get(tableChange.entityKey) === "accept"
        ? tableAfter
        : tableBefore
      : targetTableName;

  tableChange.columnChanges.forEach((columnChange) => {
    const oldColumnName =
      columnChange.oldColumn?.physicalName || columnChange.oldColumn?.logicalName || "old_column";
    const newColumnName =
      columnChange.newColumn?.physicalName || columnChange.newColumn?.logicalName || "new_column";

    if (columnChange.action === "added" && columnChange.newColumn) {
      const definition = resolveColumnDefinition(columnChange.newColumn, dialect);
      statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} ADD ${definition};`);
      return;
    }

    if (columnChange.action === "removed") {
      statements.push(
        `ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} DROP COLUMN ${quoteColumnName(
          oldColumnName,
          dialect,
        )};`,
      );
      return;
    }

    if (columnChange.action === "modified" && columnChange.newColumn) {
      const definition = resolveColumnDefinition(columnChange.newColumn, dialect);
      if (dialect === "mysql") {
        statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} MODIFY COLUMN ${definition};`);
      } else {
        statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} MODIFY (${definition});`);
      }
      return;
    }

    if (columnChange.action === "rename_suggest" || columnChange.action === "renamed") {
      const decision =
        columnChange.action === "renamed"
          ? "accept"
          : columnChange.entityKey
          ? decisionMap.get(columnChange.entityKey)
          : "pending";
      if (decision === "accept") {
        statements.push(
          `ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} RENAME COLUMN ${quoteColumnName(
            oldColumnName,
            dialect,
          )} TO ${quoteColumnName(newColumnName, dialect)};`,
        );
        if (columnChange.newColumn && hasDefinitionLevelColumnChanges(columnChange.changedFields ?? [])) {
          const definition = resolveColumnDefinition(columnChange.newColumn, dialect);
          if (dialect === "mysql") {
            statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} MODIFY COLUMN ${definition};`);
          } else {
            statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} MODIFY (${definition});`);
          }
        }
      } else if (decision === "reject" && columnChange.oldColumn && columnChange.newColumn) {
        statements.push(
          `ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} DROP COLUMN ${quoteColumnName(
            oldColumnName,
            dialect,
          )};`,
        );
        const definition = resolveColumnDefinition(columnChange.newColumn, dialect);
        statements.push(`ALTER TABLE ${quoteTableName(resolvedTableName || targetTableName, dialect)} ADD ${definition};`);
      } else if (includeUnconfirmed) {
        statements.push(`-- TODO(confirm rename): ${oldColumnName} -> ${newColumnName}`);
      }
    }
  });

  return statements;
}

function buildAlterArtifacts(
  payload: StoredDiffPayload,
  request: SchemaDiffAlterPreviewRequest,
  decisionMap: Map<string, DiffRenameDecision["decision"]>,
): SchemaDiffAlterPreviewResponse["artifacts"] {
  const perSheetSql = new Map<string, string[]>();
  payload.sheets.forEach((sheet) => {
    const lines: string[] = [];
    sheet.tableChanges.forEach((tableChange) => {
      if (request.outputMode === "single_table" && tableChange.action === "added") {
        return;
      }
      lines.push(
        ...buildAlterStatementsForTableChange(
          tableChange,
          request.dialect,
          decisionMap,
          request.includeUnconfirmed,
        ),
      );
    });
    perSheetSql.set(sheet.sheetName, lines.filter(Boolean));
  });

  const artifacts: SchemaDiffAlterPreviewResponse["artifacts"] = [];
  if (request.splitBySheet) {
    perSheetSql.forEach((lines, sheetName) => {
      if (lines.length === 0) {
        return;
      }
      artifacts.push({
        artifactName: `${sheetName}_alter.sql`,
        sheetName,
        sql: lines.join("\n"),
      });
    });
    return artifacts;
  }

  const allLines = Array.from(perSheetSql.entries())
    .flatMap(([sheetName, lines]) => (lines.length > 0 ? [`-- Sheet: ${sheetName}`, ...lines, ""] : []))
    .filter((line) => line !== "");

  if (allLines.length === 0) {
    return artifacts;
  }

  artifacts.push({
    artifactName: "alter_preview.sql",
    sql: allLines.join("\n"),
  });
  return artifacts;
}

export async function previewSchemaDiff(request: SchemaDiffPreviewRequest): Promise<SchemaDiffPreviewResponse> {
  const newFile = await storage.getUploadedFile(request.newFileId);
  if (!newFile) {
    throw new Error("Target file not found");
  }

  const thresholds = resolveThresholds(request.thresholds);
  const newSnapshot = await getOrCreateSnapshot(newFile);
  const { oldFile, link } = await selectBaselineFile(request, newFile, newSnapshot.payload, thresholds);
  const oldSnapshot = await getOrCreateSnapshot(oldFile);

  const optionsHash = buildOptionsHash({
    scope: request.scope,
    sheetName: request.sheetName,
    thresholds,
  });
  const cacheKey = buildCacheKey({
    newSnapshotHash: newSnapshot.row.snapshotHash,
    oldSnapshotHash: oldSnapshot.row.snapshotHash,
    scope: request.scope,
    sheetName: request.sheetName,
    optionsHash,
  });

  if (!request.forceRecompute) {
    const cached = await storage.getSchemaDiffByCacheKey(cacheKey);
    if (cached) {
      await storage.touchSchemaDiff(cached.id);
      const payload = loadStoredDiffPayload(cached);
      const decisionRows = await storage.listDiffRenameDecisions(cached.id);
      const decisionMap = new Map(decisionRows.map((row) => [row.entityKey, row.decision]));
      const resolved = applyRenameDecisions(payload, decisionMap);
      return {
        diffId: cached.id,
        cacheHit: true,
        algorithmVersion: payload.algorithmVersion,
        scope: payload.scope,
        sheetName: payload.sheetName,
        link: payload.link,
        summary: resolved.summary,
        sheets: resolved.sheets,
        renameSuggestions: resolved.renameSuggestions,
        mcpHints: resolved.mcpHints,
      };
    }
  }

  const sheetNames =
    request.scope === "current_sheet"
      ? [request.sheetName!]
      : Array.from(
          new Set([
            ...newSnapshot.payload.sheets.map((sheet) => sheet.sheetName),
            ...oldSnapshot.payload.sheets.map((sheet) => sheet.sheetName),
          ]),
        ).sort((left, right) => left.localeCompare(right));

  const sheets: SchemaDiffPreviewResponse["sheets"] = [];
  const renameSuggestions: SchemaDiffRenameSuggestion[] = [];
  let baselineSheetNameForCurrentScope: string | undefined;

  if (request.scope === "current_sheet") {
    baselineSheetNameForCurrentScope = resolveCurrentSheetBaselineName(
      request.sheetName!,
      newSnapshot.payload,
      oldSnapshot.payload,
    );
  }

  sheetNames.forEach((sheetName) => {
    const oldSheetName =
      request.scope === "current_sheet" && baselineSheetNameForCurrentScope
        ? baselineSheetNameForCurrentScope
        : sheetName;
    const oldTables = getSheetTables(oldSnapshot.payload, oldSheetName);
    const newTables = getSheetTables(newSnapshot.payload, sheetName);
    const sheetDiff = diffSheetTables(sheetName, oldTables, newTables, thresholds);
    if (sheetDiff.tableChanges.length === 0) {
      return;
    }
    sheets.push({
      sheetName,
      tableChanges: sheetDiff.tableChanges,
    });
    renameSuggestions.push(...sheetDiff.renameSuggestions);
  });

  const summary = calculateSummary(sheets, renameSuggestions);
  const mcpHints = buildMcpHints(sheets, renameSuggestions);
  if (
    request.scope === "current_sheet" &&
    baselineSheetNameForCurrentScope &&
    baselineSheetNameForCurrentScope !== request.sheetName
  ) {
    mcpHints.nextActions = [
      `Current sheet baseline mapped to old sheet "${baselineSheetNameForCurrentScope}" for better diff alignment.`,
      ...mcpHints.nextActions,
    ];
    mcpHints.impactKeywords = Array.from(
      new Set([...mcpHints.impactKeywords, `baseline_sheet:${baselineSheetNameForCurrentScope}`]),
    );
  }

  const payload: StoredDiffPayload = {
    algorithmVersion: SCHEMA_DIFF_ALGORITHM_VERSION,
    scope: request.scope,
    sheetName: request.sheetName,
    link,
    summary,
    sheets,
    renameSuggestions,
    mcpHints,
  };

  const diffId = crypto.randomUUID();
  const created = await storage.createOrUpdateSchemaDiff({
    id: diffId,
    newSnapshotHash: newSnapshot.row.snapshotHash,
    oldSnapshotHash: oldSnapshot.row.snapshotHash,
    scope: request.scope,
    sheetName: request.sheetName,
    algorithmVersion: SCHEMA_DIFF_ALGORITHM_VERSION,
    optionsHash,
    cacheKey,
    diffJson: JSON.stringify(payload),
    alterPreviewJson: undefined,
    hitCount: 0,
  });

  await storage.replaceDiffRenameDecisions(
    created.id,
    renameSuggestions.map((suggestion) => ({
      diffId: created.id,
      entityType: suggestion.entityType,
      entityKey: suggestion.entityKey,
      decision: "pending",
      confidence: suggestion.confidence,
      userNote: undefined,
    })),
  );

  return {
    diffId: created.id,
    cacheHit: false,
    algorithmVersion: SCHEMA_DIFF_ALGORITHM_VERSION,
    scope: request.scope,
    sheetName: request.sheetName,
    link,
    summary,
    sheets,
    renameSuggestions,
    mcpHints,
  };
}

export async function confirmRenameSuggestions(
  request: SchemaDiffConfirmRequest,
): Promise<SchemaDiffConfirmResponse> {
  const diff = await storage.getSchemaDiffById(request.diffId);
  if (!diff) {
    throw new Error("Diff result not found");
  }
  const payload = loadStoredDiffPayload(diff);
  const existing = await storage.listDiffRenameDecisions(diff.id);
  const decisionMap = new Map(existing.map((item) => [item.entityKey, item]));

  request.decisions.forEach((item) => {
    const existingDecision = decisionMap.get(item.entityKey);
    if (existingDecision) {
      existingDecision.decision = item.decision;
    } else {
      decisionMap.set(item.entityKey, {
        id: 0,
        diffId: diff.id,
        entityType: item.entityType,
        entityKey: item.entityKey,
        decision: item.decision,
        confidence: 0,
        userNote: undefined,
      });
    }
  });

  await storage.replaceDiffRenameDecisions(
    diff.id,
    Array.from(decisionMap.values()).map((decision) => ({
      diffId: diff.id,
      entityType: decision.entityType,
      entityKey: decision.entityKey,
      decision: decision.decision,
      confidence: decision.confidence,
      userNote: decision.userNote,
    })),
  );

  const resolvedMap = new Map(Array.from(decisionMap.values()).map((item) => [item.entityKey, item.decision]));
  const resolved = applyRenameDecisions(payload, resolvedMap);
  return {
    diffId: diff.id,
    summary: resolved.summary,
    sheets: resolved.sheets,
    renameSuggestions: resolved.renameSuggestions,
  };
}

export async function previewSchemaDiffAlterSql(
  request: SchemaDiffAlterPreviewRequest,
): Promise<SchemaDiffAlterPreviewResponse> {
  const diff = await storage.getSchemaDiffById(request.diffId);
  if (!diff) {
    throw new Error("Diff result not found");
  }
  const payload = loadStoredDiffPayload(diff);
  const decisions = await storage.listDiffRenameDecisions(diff.id);
  const decisionMap = new Map(decisions.map((item) => [item.entityKey, item.decision]));

  const artifacts = buildAlterArtifacts(payload, request, decisionMap);

  return {
    diffId: diff.id,
    dialect: request.dialect,
    packaging: request.packaging,
    outputMode: request.outputMode,
    splitBySheet: request.splitBySheet,
    artifacts,
  };
}

function parseScoreBreakdownJson(raw?: string): ScoreBreakdown | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as ScoreBreakdown;
    if (
      typeof parsed.fileName === "number" &&
      typeof parsed.uploadedAt === "number" &&
      typeof parsed.content === "number"
    ) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function scoreHistoryCandidates(newFile: UploadedFile): Promise<CandidateScore[]> {
  const newSnapshot = await getOrCreateSnapshot(newFile);
  const allFiles = await storage.getUploadedFiles();
  const candidatePool = pickCandidatePool(newFile, allFiles);
  if (candidatePool.length === 0) {
    return [];
  }
  const shortlistedCandidates = rankCandidatesQuickly(newFile, candidatePool);
  return scoreBaselineCandidates(newFile, newSnapshot.payload, shortlistedCandidates);
}

export async function getSchemaDiffHistory(newFileId: number): Promise<SchemaDiffHistoryResponse> {
  const newFile = await storage.getUploadedFile(newFileId);
  if (!newFile) {
    throw new Error("Target file not found");
  }

  const scored = await scoreHistoryCandidates(newFile);
  const thresholds = resolveThresholds();
  const recommended = resolveAutoBaselineCandidate(newFile, scored, thresholds);
  const links = await storage.listVersionLinksByNewFileId(newFileId);
  const linkMap = new Map<number, VersionLink>(links.map((item) => [item.oldFileId, item]));

  const candidates = scored.map((item) => {
    const link = linkMap.get(item.file.id);
    const breakdown = link?.scoreBreakdownJson
      ? parseScoreBreakdownJson(link.scoreBreakdownJson)
      : item.breakdown;
    return {
      fileId: item.file.id,
      originalName: item.file.originalName,
      uploadedAt: item.file.uploadedAt ?? undefined,
      confidence: link?.confidence ?? item.score,
      scoreBreakdown: breakdown,
    };
  });

  return {
    newFileId,
    autoRecommendedOldFileId: recommended?.file.id,
    candidates,
  };
}
