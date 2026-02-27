import { parentPort } from "worker_threads";
import { getSheetNames, parseSheetRegion, parseTableDefinitions, type ParseOptions } from "./excel.ts";
import type { TableInfo } from "../../shared/schema.ts";

export interface SearchIndexItem {
  type: "sheet" | "table";
  sheetName: string;
  displayName: string;
  physicalTableName?: string;
  logicalTableName?: string;
}

type WorkerTaskType =
  | "listSheets"
  | "parseTableDefinitions"
  | "parseSheetRegion"
  | "buildSearchIndex";

interface WorkerRequest {
  id: string;
  type: WorkerTaskType;
  payload: Record<string, unknown>;
}

interface WorkerSuccessResponse {
  id: string;
  ok: true;
  result: unknown;
}

interface WorkerErrorResponse {
  id: string;
  ok: false;
  error: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

function buildSearchIndex(filePath: string, parseOptions?: ParseOptions): SearchIndexItem[] {
  const sheetNames = getSheetNames(filePath);
  const searchIndex: SearchIndexItem[] = [];

  sheetNames.forEach((sheetName) => {
    searchIndex.push({
      type: "sheet",
      sheetName,
      displayName: sheetName,
    });

    try {
      const tables = parseTableDefinitions(filePath, sheetName, parseOptions);
      tables.forEach((table: TableInfo) => {
        searchIndex.push({
          type: "table",
          sheetName,
          displayName: `${table.physicalTableName} (${table.logicalTableName})`,
          physicalTableName: table.physicalTableName,
          logicalTableName: table.logicalTableName,
        });
      });
    } catch {
      // Ignore parsing errors per sheet to keep search available for partial content.
    }
  });

  return searchIndex;
}

function parseRequest(request: WorkerRequest): unknown {
  switch (request.type) {
    case "listSheets": {
      const filePath = String(request.payload.filePath ?? "");
      return getSheetNames(filePath);
    }
    case "parseTableDefinitions": {
      const filePath = String(request.payload.filePath ?? "");
      const sheetName = String(request.payload.sheetName ?? "");
      const parseOptions = (request.payload.parseOptions ?? {}) as ParseOptions;
      return parseTableDefinitions(filePath, sheetName, parseOptions);
    }
    case "parseSheetRegion": {
      const filePath = String(request.payload.filePath ?? "");
      const sheetName = String(request.payload.sheetName ?? "");
      const startRow = Number(request.payload.startRow);
      const endRow = Number(request.payload.endRow);
      const startCol = Number(request.payload.startCol);
      const endCol = Number(request.payload.endCol);
      const parseOptions = (request.payload.parseOptions ?? {}) as ParseOptions;
      return parseSheetRegion(filePath, sheetName, startRow, endRow, startCol, endCol, parseOptions);
    }
    case "buildSearchIndex": {
      const filePath = String(request.payload.filePath ?? "");
      const parseOptions = (request.payload.parseOptions ?? {}) as ParseOptions;
      return buildSearchIndex(filePath, parseOptions);
    }
    default: {
      throw new Error(`Unknown worker task type: ${(request as { type?: string }).type ?? "undefined"}`);
    }
  }
}

if (!parentPort) {
  throw new Error("excel-worker must run inside worker_threads");
}

parentPort.on("message", (request: WorkerRequest) => {
  let response: WorkerResponse;

  try {
    const result = parseRequest(request);
    response = {
      id: request.id,
      ok: true,
      result,
    };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  parentPort!.postMessage(response);
});
