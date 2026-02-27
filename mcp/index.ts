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
import { runListSheets, runParseRegion, runParseTables } from "../server/lib/excel-executor";
import { generateDDL } from "../server/lib/ddl";
import { createLogger } from "../server/lib/logger";
import type { TableInfo } from "../shared/schema";

const logger = createLogger("mcp-server");

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);
const DEFAULT_PK_MARKERS = ["\u3007"];

const FilePathSchema = z.object({
  filePath: z.string().trim().min(1, "filePath is required"),
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

type ToolName =
  | "list_excel_sheets"
  | "parse_excel_to_ddl"
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
  { name: "ddl-generator", version: "1.2.0" },
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
        "Parse Excel sheet data and return table JSON plus generated DDL. Optional region arguments can limit parsing scope.",
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
        },
        required: ["filePath", "sheetName"],
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
          tableNamesChanged: normalized.stats.tableNamesChanged,
          columnNamesChanged: normalized.stats.columnNamesChanged,
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
