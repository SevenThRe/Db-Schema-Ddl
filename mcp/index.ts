import fs from "fs";
import path from "path";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ParseOptions } from "../server/lib/excel";
import { runListSheets, runParseRegion, runParseTables, runParseWorkbookBundle } from "../server/lib/excel-executor";
import { generateDDL } from "../server/lib/ddl";
import { createLogger } from "../server/lib/logger";
import type { CodeReference, TableInfo } from "../shared/schema";

const logger = createLogger("mcp-server");

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);
const DEFAULT_PK_MARKERS = ["\u3007"];
const MAX_REFERENCE_RULE_PATTERN_LENGTH = 1000;
const ALLOWED_REFERENCE_REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const CodeIdMatchModeSchema = z.enum(["contains", "exact", "starts_with"]);
const SourceMatchModeSchema = z.enum(["exact", "contains"]);

const FilePathSchema = z.object({
  filePath: z.string().trim().min(1, "filePath is required"),
});

const ReferenceExtractionRuleSchema = z.object({
  source: z.string().trim().min(1).max(64).optional(),
  pattern: z.string().trim().min(1).max(MAX_REFERENCE_RULE_PATTERN_LENGTH),
  flags: z
    .string()
    .trim()
    .optional()
    .refine((flags) => {
      if (!flags) return true;
      const chars = flags.split("");
      const unique = new Set(chars);
      return unique.size === chars.length && chars.every((ch) => ALLOWED_REFERENCE_REGEX_FLAGS.has(ch));
    }, "flags must be unique chars from [gimsu]"),
  codeIdGroup: z.number().int().min(1).optional(),
  optionsGroup: z.number().int().min(1).optional(),
});

const ReferenceExtractionBaseSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z.array(ReferenceExtractionRuleSchema).max(50).optional(),
});

const ParseExcelToDdlSchema = z
  .object({
    filePath: z.string().trim().min(1, "filePath is required"),
    sheetName: z.string().trim().min(1, "sheetName is required"),
    startRow: z.number().int().nonnegative().optional(),
    endRow: z.number().int().nonnegative().optional(),
    startCol: z.number().int().nonnegative().optional(),
    endCol: z.number().int().nonnegative().optional(),
    dialect: z.enum(["mysql", "oracle"]).default("mysql"),
    nameNormalization: z.enum(["none", "snake_case"]).default("none"),
    maxConsecutiveEmptyRows: z.number().int().min(1).max(100).optional(),
    pkMarkers: z.array(z.string().trim().min(1)).optional(),
    referenceExtraction: ReferenceExtractionBaseSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasAnyRegion =
      data.startRow !== undefined ||
      data.endRow !== undefined ||
      data.startCol !== undefined ||
      data.endCol !== undefined;

    const hasAllRegion =
      data.startRow !== undefined &&
      data.endRow !== undefined &&
      data.startCol !== undefined &&
      data.endCol !== undefined;

    if (hasAnyRegion && !hasAllRegion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Region parsing requires startRow/endRow/startCol/endCol together",
      });
    }

    if (hasAllRegion) {
      if (data.endRow! < data.startRow!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endRow must be greater than or equal to startRow",
        });
      }
      if (data.endCol! < data.startCol!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endCol must be greater than or equal to startCol",
        });
      }
    }
  });

const QueryCommentReferencesSchema = z.object({
  filePath: z.string().trim().min(1, "filePath is required"),
  sheetName: z.string().trim().min(1).optional(),
  query: z.string().trim().optional(),
  source: z.string().trim().optional(),
  sourceMatchMode: SourceMatchModeSchema.default("exact"),
  codeId: z.string().trim().optional(),
  codeIdMatchMode: CodeIdMatchModeSchema.default("contains"),
  includeColumnsWithoutReferences: z.boolean().default(true),
  maxResults: z.number().int().min(1).max(5000).default(500),
  offset: z.number().int().nonnegative().default(0),
  maxConsecutiveEmptyRows: z.number().int().min(1).max(100).optional(),
  pkMarkers: z.array(z.string().trim().min(1)).optional(),
  referenceExtraction: ReferenceExtractionBaseSchema.optional(),
});

type ToolName =
  | "list_excel_sheets"
  | "parse_excel_to_ddl"
  | "query_comment_references"
  | "validate_excel_file"
  | "get_file_metadata";

const PHYSICAL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const CAMEL_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_ALNUM_UNDERSCORE_PATTERN = /[^A-Za-z0-9_]+/g;
const MULTIPLE_UNDERSCORE_PATTERN = /_+/g;
const EDGE_UNDERSCORE_PATTERN = /^_+|_+$/g;

type NameNormalizationMode = "none" | "snake_case";

interface NameNormalizationStats {
  mode: NameNormalizationMode;
  tableNamesChanged: number;
  columnNamesChanged: number;
}

interface CommentReferenceRow {
  sheetName: string;
  tableLogicalName: string;
  tablePhysicalName: string;
  columnLogicalName?: string;
  columnPhysicalName?: string;
  comment?: string;
  commentRaw?: string;
  codeReferences: CodeReference[];
  matchedReferences: CodeReference[];
}

interface CommentReferenceQueryResult {
  totalRowsScanned: number;
  matchedRowCount: number;
  returnedRowCount: number;
  truncated: boolean;
  filters: {
    query?: string;
    source?: string;
    sourceMatchMode: z.infer<typeof SourceMatchModeSchema>;
    codeId?: string;
    codeIdMatchMode: z.infer<typeof CodeIdMatchModeSchema>;
    includeColumnsWithoutReferences: boolean;
    maxResults: number;
    offset: number;
  };
  rows: CommentReferenceRow[];
}

function toLowerTrimmed(value?: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesByMode(
  target: string,
  filter: string,
  mode: z.infer<typeof CodeIdMatchModeSchema> | z.infer<typeof SourceMatchModeSchema>,
): boolean {
  if (mode === "exact") {
    return target === filter;
  }
  if (mode === "starts_with") {
    return target.startsWith(filter);
  }
  return target.includes(filter);
}

function flattenCommentRowsBySheet(
  tablesBySheet: Record<string, TableInfo[]>,
): CommentReferenceRow[] {
  const rows: CommentReferenceRow[] = [];

  for (const [sheetName, tables] of Object.entries(tablesBySheet)) {
    for (const table of tables) {
      for (const column of table.columns) {
        const commentRaw = column.commentRaw;
        const comment = column.comment;
        const references = Array.isArray(column.codeReferences) ? column.codeReferences : [];
        const hasComment = Boolean(commentRaw ?? comment);
        if (!hasComment && references.length === 0) {
          continue;
        }

        rows.push({
          sheetName,
          tableLogicalName: table.logicalTableName,
          tablePhysicalName: table.physicalTableName,
          columnLogicalName: column.logicalName,
          columnPhysicalName: column.physicalName,
          comment,
          commentRaw,
          codeReferences: references,
          matchedReferences: [],
        });
      }
    }
  }

  return rows;
}

function queryCommentReferenceRows(
  rows: CommentReferenceRow[],
  params: z.infer<typeof QueryCommentReferencesSchema>,
): CommentReferenceQueryResult {
  const queryFilter = toLowerTrimmed(params.query);
  const sourceFilter = toLowerTrimmed(params.source);
  const sourceMatchMode = params.sourceMatchMode;
  const codeIdFilter = toLowerTrimmed(params.codeId);
  const codeIdMatchMode = params.codeIdMatchMode;
  const includeColumnsWithoutReferences = params.includeColumnsWithoutReferences;
  const maxResults = params.maxResults;
  const offset = params.offset;

  const matchedRows: CommentReferenceRow[] = [];
  let matchedRowCount = 0;
  let truncated = false;

  for (const row of rows) {
    const references = row.codeReferences;
    if (!includeColumnsWithoutReferences && references.length === 0) {
      continue;
    }

    const matchedReferences = references.filter((ref) => {
      if (sourceFilter && !matchesByMode(toLowerTrimmed(ref.source), sourceFilter, sourceMatchMode)) {
        return false;
      }
      if (codeIdFilter && !matchesByMode(toLowerTrimmed(ref.codeId), codeIdFilter, codeIdMatchMode)) {
        return false;
      }
      if (!queryFilter) {
        return true;
      }

      const refHaystack = [
        ref.source,
        ref.codeId,
        ref.raw,
        ...(ref.options?.map((item) => `${item.code}:${item.label}`) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return refHaystack.includes(queryFilter);
    });

    const textHaystack = [
      row.sheetName,
      row.tableLogicalName,
      row.tablePhysicalName,
      row.columnLogicalName,
      row.columnPhysicalName,
      row.comment,
      row.commentRaw,
    ]
      .filter((item) => item !== undefined && item !== null)
      .join(" ")
      .toLowerCase();

    const hasReferenceFilter = Boolean(sourceFilter || codeIdFilter);
    const rowMatched = hasReferenceFilter
      ? matchedReferences.length > 0
      : queryFilter
      ? textHaystack.includes(queryFilter) || matchedReferences.length > 0
      : includeColumnsWithoutReferences || references.length > 0;

    if (!rowMatched) {
      continue;
    }

    matchedRowCount++;
    if (matchedRowCount <= offset) {
      continue;
    }

    if (matchedRows.length < maxResults) {
      matchedRows.push({
        ...row,
        matchedReferences,
      });
    } else {
      truncated = true;
    }
  }

  return {
    totalRowsScanned: rows.length,
    matchedRowCount,
    returnedRowCount: matchedRows.length,
    truncated,
    filters: {
      query: params.query,
      source: params.source,
      sourceMatchMode,
      codeId: params.codeId,
      codeIdMatchMode,
      includeColumnsWithoutReferences,
      maxResults,
      offset,
    },
    rows: matchedRows,
  };
}

function isValidPhysicalName(name?: string): boolean {
  if (!name) return false;
  return PHYSICAL_NAME_PATTERN.test(name.trim());
}

function normalizePhysicalName(name?: string, fallback = "unnamed"): string {
  const raw = (name ?? "").trim();
  if (!raw) {
    return fallback;
  }

  let normalized = raw
    .replace(CAMEL_BOUNDARY_PATTERN, "$1_$2")
    .replace(NON_ALNUM_UNDERSCORE_PATTERN, "_")
    .toLowerCase()
    .replace(MULTIPLE_UNDERSCORE_PATTERN, "_")
    .replace(EDGE_UNDERSCORE_PATTERN, "");

  if (!normalized) {
    normalized = fallback;
  }

  if (/^\d/.test(normalized)) {
    normalized = `t_${normalized}`;
  }

  return normalized;
}

function applyNameNormalization(
  tables: TableInfo[],
  mode: NameNormalizationMode,
): { tables: TableInfo[]; stats: NameNormalizationStats } {
  if (mode === "none") {
    return {
      tables,
      stats: {
        mode,
        tableNamesChanged: 0,
        columnNamesChanged: 0,
      },
    };
  }

  let tableNamesChanged = 0;
  let columnNamesChanged = 0;

  const normalizedTables = tables.map((table, tableIndex) => {
    const currentTableName = table.physicalTableName ?? "";
    const nextTableName = isValidPhysicalName(currentTableName)
      ? currentTableName
      : normalizePhysicalName(
          currentTableName || table.logicalTableName,
          `unnamed_table_${tableIndex + 1}`,
        );

    if (currentTableName !== nextTableName) {
      tableNamesChanged++;
    }

    const nextColumns = table.columns.map((column, columnIndex) => {
      const currentColumnName = column.physicalName ?? "";
      const nextColumnName = isValidPhysicalName(currentColumnName)
        ? currentColumnName
        : normalizePhysicalName(
            currentColumnName || column.logicalName || `column_${columnIndex + 1}`,
            `column_${columnIndex + 1}`,
          );

      if (currentColumnName !== nextColumnName) {
        columnNamesChanged++;
      }

      if (currentColumnName === nextColumnName) {
        return column;
      }

      return {
        ...column,
        physicalName: nextColumnName,
      };
    });

    const tableChanged = currentTableName !== nextTableName;
    const columnsChanged = nextColumns.some((column, columnIndex) => column !== table.columns[columnIndex]);

    if (!tableChanged && !columnsChanged) {
      return table;
    }

    return {
      ...table,
      physicalTableName: nextTableName,
      columns: nextColumns,
    };
  });

  return {
    tables: normalizedTables,
    stats: {
      mode,
      tableNamesChanged,
      columnNamesChanged,
    },
  };
}

const server = new Server(
  { name: "ddl-generator", version: "1.3.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_excel_sheets",
      description: "Return sheet names from an Excel file",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "Absolute path or project-relative path to the Excel file",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "parse_excel_to_ddl",
      description:
        "Parse Excel sheet data and return table JSON plus generated DDL. Use query_comment_references for deep comment exploration.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" },
          sheetName: { type: "string" },
          startRow: { type: "number" },
          endRow: { type: "number" },
          startCol: { type: "number" },
          endCol: { type: "number" },
          dialect: { type: "string", enum: ["mysql", "oracle"] },
          nameNormalization: {
            type: "string",
            enum: ["none", "snake_case"],
            description:
              "Physical name normalization mode. Use snake_case to auto-fix invalid table/column names.",
          },
          maxConsecutiveEmptyRows: {
            type: "number",
            description: "Max consecutive empty rows before parser stops (default: 10).",
          },
          pkMarkers: {
            type: "array",
            items: { type: "string" },
            description: "PK marker tokens (default: ['〇']).",
          },
          referenceExtraction: {
            type: "object",
            description:
              "Optional structured-reference extraction controls for parsed table columns.",
            properties: {
              enabled: {
                type: "boolean",
                description: "Enable/disable structured reference extraction from comments (default: true).",
              },
              rules: {
                type: "array",
                description:
                  "Custom regex rules. Each rule should include a capture group for code ID and optional options group.",
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    pattern: { type: "string" },
                    flags: {
                      type: "string",
                      description: "Regex flags. Allowed unique chars: g, i, m, s, u.",
                    },
                    codeIdGroup: { type: "number" },
                    optionsGroup: { type: "number" },
                  },
                  required: ["pattern"],
                },
              },
            },
          },
        },
        required: ["filePath", "sheetName"],
      },
    },
    {
      name: "query_comment_references",
      description:
        "Explore comment/remark details for AI. Returns raw comment text plus structured references with optional filters across one sheet or all sheets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" },
          sheetName: {
            type: "string",
            description:
              "Optional target sheet. If omitted, parse all sheets and return matched rows across workbook.",
          },
          query: {
            type: "string",
            description:
              "Optional keyword filter against sheet/table/column/comment text and matched reference payload.",
          },
          source: {
            type: "string",
            description: "Optional reference source filter (e.g. code_master).",
          },
          sourceMatchMode: {
            type: "string",
            enum: ["exact", "contains"],
            description:
              "Source filter match mode (default: exact). Matching is case-insensitive after trim.",
          },
          codeId: {
            type: "string",
            description: "Optional code ID filter value (case-insensitive after trim).",
          },
          codeIdMatchMode: {
            type: "string",
            enum: ["contains", "exact", "starts_with"],
            description:
              "Code ID filter match mode (default: contains). Matching is case-insensitive after trim.",
          },
          includeColumnsWithoutReferences: {
            type: "boolean",
            description:
              "When true, include comment rows even if no structured reference was extracted (default: true).",
          },
          maxResults: {
            type: "number",
            description: "Maximum result rows returned (default: 500, max: 5000).",
          },
          offset: {
            type: "number",
            description: "Skip this number of matched rows before returning results (default: 0).",
          },
          maxConsecutiveEmptyRows: {
            type: "number",
            description: "Parser option: max consecutive empty rows before stop (default: 10).",
          },
          pkMarkers: {
            type: "array",
            items: { type: "string" },
            description: "Parser option: PK marker tokens (default: ['〇']).",
          },
          referenceExtraction: {
            type: "object",
            description: "Optional extraction rules override.",
            properties: {
              enabled: { type: "boolean" },
              rules: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    pattern: { type: "string" },
                    flags: {
                      type: "string",
                      description: "Regex flags. Allowed unique chars: g, i, m, s, u.",
                    },
                    codeIdGroup: { type: "number" },
                    optionsGroup: { type: "number" },
                  },
                  required: ["pattern"],
                },
              },
            },
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "validate_excel_file",
      description: "Validate whether a file can be parsed as Excel in current limits",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "get_file_metadata",
      description: "Return basic file metadata (size/time/path/extension)",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" },
        },
        required: ["filePath"],
      },
    },
  ],
}));

function normalizePkMarkers(markers?: string[]): string[] {
  const source = Array.isArray(markers) ? markers : DEFAULT_PK_MARKERS;
  const cleaned = source
    .map((marker) => String(marker ?? "").trim())
    .filter((marker) => marker.length > 0);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : DEFAULT_PK_MARKERS;
}

function normalizeReferenceExtractionConfig(
  raw?: z.infer<typeof ReferenceExtractionBaseSchema>,
): ParseOptions["referenceExtraction"] | undefined {
  if (!raw) {
    return undefined;
  }

  const rules = Array.isArray(raw.rules)
    ? raw.rules
        .map((rule) => ({
          source: rule.source?.trim() || undefined,
          pattern: rule.pattern.trim(),
          flags: rule.flags?.trim() || undefined,
          codeIdGroup: rule.codeIdGroup,
          optionsGroup: rule.optionsGroup,
        }))
        .filter((rule) => rule.pattern.length > 0)
    : undefined;

  const normalized = {
    enabled: raw.enabled,
    rules: rules && rules.length > 0 ? rules : undefined,
  };

  if (normalized.enabled === undefined && !normalized.rules) {
    return undefined;
  }

  return normalized;
}

function getAllowedRoots(): string[] {
  const workspaceRoot = path.resolve(process.cwd());
  const defaultRoots = [
    workspaceRoot,
    path.resolve(workspaceRoot, "uploads"),
    path.resolve(workspaceRoot, "attached_assets"),
  ];

  const envRoots = String(process.env.MCP_ALLOWED_DIRS ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => path.resolve(item));

  const uniqueRoots = Array.from(new Set([...defaultRoots, ...envRoots]));

  return uniqueRoots.map((root) => {
    try {
      return fs.realpathSync(root);
    } catch {
      return root;
    }
  });
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  const rootForCompare = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  const targetForCompare = process.platform === "win32" ? normalizedTarget.toLowerCase() : normalizedTarget;
  const relative = path.relative(rootForCompare, targetForCompare);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveAndValidatePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  const workspaceRoot = path.resolve(process.cwd());
  const resolved = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(workspaceRoot, trimmed);
  const allowedRoots = getAllowedRoots();

  if (!allowedRoots.some((root) => isPathWithinRoot(root, resolved))) {
    throw new Error("Access denied: file path is outside allowed directories.");
  }

  if (!fs.existsSync(resolved)) {
    return resolved;
  }

  const resolvedRealPath = fs.realpathSync(resolved);
  if (!allowedRoots.some((root) => isPathWithinRoot(root, resolvedRealPath))) {
    throw new Error("Access denied: resolved file path is outside allowed directories.");
  }

  return resolvedRealPath;
}

function inspectExcelFile(inputPath: string): {
  resolvedPath: string;
  extension: string;
  stats: fs.Stats;
} {
  const resolvedPath = resolveAndValidatePath(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`);
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file extension: ${extension}. Allowed: .xlsx, .xls`);
  }

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds size limit: ${stats.size} bytes (max: ${MAX_FILE_SIZE_BYTES} bytes)`,
    );
  }

  return { resolvedPath, extension, stats };
}

function successResponse(tool: ToolName, startedAt: number, data: unknown, extra: Record<string, unknown> = {}) {
  const response = {
    success: true,
    data,
    metadata: {
      tool,
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...extra,
    },
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
  };
}

function errorResponse(tool: string, startedAt: number, error: unknown) {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const message =
    tool === "parse_excel_to_ddl" && baseMessage.includes("DDL validation failed")
      ? `${baseMessage} Hint: enable nameNormalization="snake_case" or fix invalid names/types in source Excel.`
      : baseMessage;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: false,
            error: message,
            metadata: {
              tool,
              processedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAt,
            },
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const startedAt = Date.now();
  const { name, arguments: args } = request.params;
  logger.info("Tool called", { name });
  logger.debug("Tool arguments", { args });

  try {
    if (name === "list_excel_sheets") {
      const { filePath } = FilePathSchema.parse(args ?? {});
      const { resolvedPath, stats } = inspectExcelFile(filePath);
      const sheets = await runListSheets(resolvedPath);

      return successResponse(
        "list_excel_sheets",
        startedAt,
        { sheets },
        {
          filePath: resolvedPath,
          fileSizeBytes: stats.size,
          sheetCount: sheets.length,
        },
      );
    }

    if (name === "parse_excel_to_ddl") {
      const parsed = ParseExcelToDdlSchema.parse(args ?? {});
      const { resolvedPath, stats } = inspectExcelFile(parsed.filePath);
      const parseOptions: ParseOptions = {
        maxConsecutiveEmptyRows: parsed.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: normalizePkMarkers(parsed.pkMarkers),
        referenceExtraction: normalizeReferenceExtractionConfig(parsed.referenceExtraction),
      };

      const hasRegion =
        parsed.startRow !== undefined &&
        parsed.endRow !== undefined &&
        parsed.startCol !== undefined &&
        parsed.endCol !== undefined;

      let tables: TableInfo[];
      if (hasRegion) {
        tables = await runParseRegion(
          resolvedPath,
          parsed.sheetName,
          parsed.startRow!,
          parsed.endRow!,
          parsed.startCol!,
          parsed.endCol!,
          parseOptions,
        );
      } else {
        tables = await runParseTables(resolvedPath, parsed.sheetName, parseOptions);
      }

      const normalized = applyNameNormalization(tables, parsed.nameNormalization);
      tables = normalized.tables;

      const ddl = generateDDL({
        tables,
        dialect: parsed.dialect,
      });

      return successResponse(
        "parse_excel_to_ddl",
        startedAt,
        {
          tables,
          ddl,
          normalization: normalized.stats,
        },
        {
          filePath: resolvedPath,
          fileSizeBytes: stats.size,
          sheetName: parsed.sheetName,
          dialect: parsed.dialect,
          tableCount: tables.length,
          parsedByRegion: hasRegion,
          nameNormalization: parsed.nameNormalization,
          maxConsecutiveEmptyRows: parseOptions.maxConsecutiveEmptyRows,
          pkMarkers: parseOptions.pkMarkers,
          referenceExtractionEnabled: parseOptions.referenceExtraction?.enabled ?? true,
          referenceRuleCount: parseOptions.referenceExtraction?.rules?.length ?? 0,
          tableNamesChanged: normalized.stats.tableNamesChanged,
          columnNamesChanged: normalized.stats.columnNamesChanged,
        },
      );
    }

    if (name === "query_comment_references") {
      const parsed = QueryCommentReferencesSchema.parse(args ?? {});
      const { resolvedPath, stats } = inspectExcelFile(parsed.filePath);
      const parseOptions: ParseOptions = {
        maxConsecutiveEmptyRows: parsed.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: normalizePkMarkers(parsed.pkMarkers),
        referenceExtraction: normalizeReferenceExtractionConfig(parsed.referenceExtraction),
      };

      let tablesBySheet: Record<string, TableInfo[]> = {};
      let parsedSheetCount = 0;
      let bundleParseMode: string | undefined;

      if (parsed.sheetName) {
        const tables = await runParseTables(resolvedPath, parsed.sheetName, parseOptions);
        tablesBySheet = { [parsed.sheetName]: tables };
        parsedSheetCount = 1;
      } else {
        const bundle = await runParseWorkbookBundle(resolvedPath, parseOptions);
        tablesBySheet = bundle.tablesBySheet;
        parsedSheetCount = Object.keys(bundle.tablesBySheet).length;
        bundleParseMode = bundle.stats.parseMode;
      }

      const rows = flattenCommentRowsBySheet(tablesBySheet);
      const result = queryCommentReferenceRows(rows, parsed);

      return successResponse(
        "query_comment_references",
        startedAt,
        result,
        {
          filePath: resolvedPath,
          fileSizeBytes: stats.size,
          requestedSheetName: parsed.sheetName,
          parsedSheetCount,
          bundleParseMode,
          maxConsecutiveEmptyRows: parseOptions.maxConsecutiveEmptyRows,
          pkMarkers: parseOptions.pkMarkers,
          referenceExtractionEnabled: parseOptions.referenceExtraction?.enabled ?? true,
          referenceRuleCount: parseOptions.referenceExtraction?.rules?.length ?? 0,
          query: parsed.query,
          source: parsed.source,
          sourceMatchMode: parsed.sourceMatchMode,
          codeId: parsed.codeId,
          codeIdMatchMode: parsed.codeIdMatchMode,
          includeColumnsWithoutReferences: parsed.includeColumnsWithoutReferences,
          maxResults: parsed.maxResults,
          offset: parsed.offset,
          totalRowsScanned: result.totalRowsScanned,
          matchedRowCount: result.matchedRowCount,
          returnedRowCount: result.returnedRowCount,
          truncated: result.truncated,
        },
      );
    }

    if (name === "validate_excel_file") {
      const { filePath } = FilePathSchema.parse(args ?? {});
      const { resolvedPath, extension, stats } = inspectExcelFile(filePath);
      const sheets = await runListSheets(resolvedPath);

      return successResponse(
        "validate_excel_file",
        startedAt,
        {
          valid: true,
          resolvedPath,
          extension,
          fileSizeBytes: stats.size,
          sheetCount: sheets.length,
          sheets,
        },
      );
    }

    if (name === "get_file_metadata") {
      const { filePath } = FilePathSchema.parse(args ?? {});
      const resolvedPath = resolveAndValidatePath(filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }

      const stats = fs.statSync(resolvedPath);
      const extension = path.extname(resolvedPath).toLowerCase();

      return successResponse(
        "get_file_metadata",
        startedAt,
        {
          resolvedPath,
          extension,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          fileSizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          accessedAt: stats.atime.toISOString(),
        },
      );
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    logger.error("Tool failed", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(name, startedAt, error);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server started");
}

main().catch((error) => {
  logger.error("Fatal error in MCP server", {
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
  process.exit(1);
});
