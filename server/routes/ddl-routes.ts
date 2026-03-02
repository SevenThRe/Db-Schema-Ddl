import type { Express, Response } from "express";
import archiver from "archiver";
import { once } from "events";
import { z } from "zod";
import { api } from "@shared/routes";
import type { DdlSettings, GenerateDdlByReferenceRequest, TableInfo } from "@shared/schema";
import { sendApiError } from "../lib/api-error";
import { collectDdlGenerationWarnings, generateDDL, streamDDL, substituteFilenameSuffix } from "../lib/ddl";
import { DdlValidationError } from "../lib/ddl-validation";
import { storage } from "../storage";

interface ResolvedReferenceTables {
  tables: TableInfo[];
  persistedSettings: DdlSettings;
}

interface DdlRouteDeps {
  resolveTablesByReference: (
    request: Pick<
      GenerateDdlByReferenceRequest,
      "fileId" | "sheetName" | "selectedTableIndexes" | "tableOverrides"
    >,
  ) => Promise<ResolvedReferenceTables>;
  handleReferenceRequestError: (err: unknown, res: Response) => boolean;
}

function formatZipTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function sanitizeSheetNameForFilename(sheetName: string): string {
  return sheetName
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, 64);
}

function deriveSheetNameHintFromTables(tables: TableInfo[]): string | undefined {
  const uniqueSheetNames = Array.from(
    new Set(
      tables
        .map((table) => table.sourceRef?.sheetName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (uniqueSheetNames.length === 1) {
    return uniqueSheetNames[0];
  }
  return undefined;
}

function buildZipDownloadFilename(
  dialect: "mysql" | "oracle",
  sheetNameHint?: string,
  date: Date = new Date(),
): string {
  const timestamp = formatZipTimestamp(date);
  if (!sheetNameHint) {
    return `ddl_${dialect}_${timestamp}.zip`;
  }
  const safeSheetName = sanitizeSheetNameForFilename(sheetNameHint);
  if (!safeSheetName) {
    return `ddl_${dialect}_${timestamp}.zip`;
  }
  return `ddl_${dialect}_${safeSheetName}_${timestamp}.zip`;
}

function buildContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encodedFilename = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

function collectZipEntries(
  tables: TableInfo[],
  dialect: "mysql" | "oracle",
  effectiveSettings: DdlSettings | undefined,
  tolerantMode: boolean,
): {
  zipEntries: Array<{ filename: string; content: string }>;
  tolerantErrors: Array<{
    tableLogicalName: string;
    tablePhysicalName: string;
    message: string;
    issues?: unknown[];
  }>;
} {
  const prefix = effectiveSettings?.exportFilenamePrefix || "Crt_";
  const suffixTemplate = effectiveSettings?.exportFilenameSuffix || "";
  const authorName = effectiveSettings?.authorName || "ISI";

  const zipEntries: Array<{ filename: string; content: string }> = [];
  const tolerantErrors: Array<{
    tableLogicalName: string;
    tablePhysicalName: string;
    message: string;
    issues?: unknown[];
  }> = [];

  for (const table of tables) {
    try {
      const singleTableDdl = generateDDL({
        tables: [table],
        dialect,
        settings: effectiveSettings,
      });
      const suffix = substituteFilenameSuffix(suffixTemplate, table, authorName);
      const filename = `${prefix}${table.physicalTableName}${suffix}.sql`;
      zipEntries.push({ filename, content: singleTableDdl });
    } catch (error) {
      if (!tolerantMode) {
        throw error;
      }

      if (error instanceof DdlValidationError) {
        tolerantErrors.push({
          tableLogicalName: table.logicalTableName,
          tablePhysicalName: table.physicalTableName,
          message: error.message,
          issues: error.issues,
        });
      } else {
        tolerantErrors.push({
          tableLogicalName: table.logicalTableName,
          tablePhysicalName: table.physicalTableName,
          message: `Unexpected error: ${(error as Error).message}`,
        });
      }
    }
  }

  return { zipEntries, tolerantErrors };
}

async function streamZipResponse(
  res: Response,
  dialect: "mysql" | "oracle",
  zipEntries: Array<{ filename: string; content: string }>,
  tolerantErrors: Array<{ tablePhysicalName: string; issues?: unknown[] }>,
  sheetNameHint?: string,
): Promise<void> {
  const successfulTableCount = zipEntries.length;
  const skippedTableNames = Array.from(
    new Set(
      tolerantErrors
        .map((item) => item.tablePhysicalName)
        .filter((name): name is string => Boolean(name && name.trim())),
    ),
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  const zipFilename = buildZipDownloadFilename(dialect, sheetNameHint);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", buildContentDisposition(zipFilename));
  res.setHeader("X-Zip-Export-Success-Count", String(successfulTableCount));
  res.setHeader("X-Zip-Export-Skipped-Count", String(tolerantErrors.length));
  res.setHeader("X-Zip-Partial-Export", tolerantErrors.length > 0 ? "1" : "0");
  if (skippedTableNames.length > 0) {
    res.setHeader("X-Zip-Export-Skipped-Tables", encodeURIComponent(JSON.stringify(skippedTableNames)));
  }

  archive.pipe(res);
  for (const entry of zipEntries) {
    archive.append(entry.content, { name: entry.filename });
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      archive.off("error", onError);
      archive.off("end", onEnd);
      res.off("close", onClose);
    };
    const settleResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const onError = (error: unknown) => {
      settleReject(error);
    };
    const onEnd = () => {
      settleResolve();
    };
    const onClose = () => {
      if (!res.writableEnded) {
        archive.abort();
        settleReject(new Error("Client disconnected during ZIP export"));
      }
    };

    archive.once("error", onError);
    archive.once("end", onEnd);
    res.once("close", onClose);
    Promise.resolve(archive.finalize()).catch(onError);
  });
}

function addTolerantErrorReport(
  tables: TableInfo[],
  zipEntries: Array<{ filename: string; content: string }>,
  tolerantErrors: Array<{
    tableLogicalName: string;
    tablePhysicalName: string;
    message: string;
    issues?: unknown[];
  }>,
): void {
  if (tolerantErrors.length === 0) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const reportLines: string[] = [
    "DDL export completed with tolerated errors.",
    `generatedAt: ${generatedAt}`,
    `selectedTableCount: ${tables.length}`,
    `successCount: ${zipEntries.length}`,
    `skippedCount: ${tolerantErrors.length}`,
    "",
  ];
  tolerantErrors.forEach((item, index) => {
    reportLines.push(`## ${index + 1}. ${item.tablePhysicalName} (${item.tableLogicalName})`);
    reportLines.push(item.message);
    if (Array.isArray(item.issues) && item.issues.length > 0) {
      reportLines.push(JSON.stringify(item.issues, null, 2));
    }
    reportLines.push("");
  });

  zipEntries.push({
    filename: "__export_errors.txt",
    content: reportLines.join("\n"),
  });
}

export function registerDdlRoutes(app: Express, deps: DdlRouteDeps): void {
  app.post(api.ddl.generate.path, async (req, res) => {
    const streamQuery = String(req.query.stream ?? "").toLowerCase();
    const streamResponse = streamQuery === "1" || streamQuery === "true";

    try {
      const request = api.ddl.generate.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;
      const effectiveSettings = hasRequestSettings ? request.settings : await storage.getSettings();
      const effectiveRequest = { ...request, settings: effectiveSettings };

      if (streamResponse) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        await streamDDL(effectiveRequest, async (chunk) => {
          const accepted = res.write(chunk);
          if (!accepted) {
            await once(res, "drain");
          }
        });
        res.end();
        return;
      }

      const ddl = generateDDL(effectiveRequest);
      const warnings = collectDdlGenerationWarnings(effectiveRequest);
      res.json({ ddl, warnings });
    } catch (err) {
      if (streamResponse && res.headersSent) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        console.error("[ddl-stream] stream failed after headers sent:", streamError);
        if (!res.destroyed) {
          res.destroy(streamError);
        }
        return;
      }
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "DDL_GENERATE_FAILED",
        message: "Failed to generate DDL",
      });
    }
  });

  app.post(api.ddl.generateByReference.path, async (req, res) => {
    const streamQuery = String(req.query.stream ?? "").toLowerCase();
    const streamResponse = streamQuery === "1" || streamQuery === "true";

    try {
      const request = api.ddl.generateByReference.input.parse(req.body);
      const { tables, persistedSettings } = await deps.resolveTablesByReference(request);
      const effectiveRequest = {
        tables,
        dialect: request.dialect,
        settings: request.settings ?? persistedSettings,
      };

      if (streamResponse) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        await streamDDL(effectiveRequest, async (chunk) => {
          const accepted = res.write(chunk);
          if (!accepted) {
            await once(res, "drain");
          }
        });
        res.end();
        return;
      }

      const ddl = generateDDL(effectiveRequest);
      const warnings = collectDdlGenerationWarnings(effectiveRequest);
      res.json({ ddl, warnings });
    } catch (err) {
      if (streamResponse && res.headersSent) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        console.error("[ddl-stream-by-reference] stream failed after headers sent:", streamError);
        if (!res.destroyed) {
          res.destroy(streamError);
        }
        return;
      }
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (deps.handleReferenceRequestError(err, res)) {
        return;
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "DDL_GENERATE_FAILED",
        message: "Failed to generate DDL",
      });
    }
  });

  app.post(api.ddl.exportZipByReference.path, async (req, res) => {
    try {
      const request = api.ddl.exportZipByReference.input.parse(req.body);
      const { tables, persistedSettings } = await deps.resolveTablesByReference(request);
      const effectiveSettings = request.settings ?? persistedSettings;
      const { dialect, tolerantMode, includeErrorReport } = request;

      const { zipEntries, tolerantErrors } = collectZipEntries(
        tables,
        dialect,
        effectiveSettings,
        tolerantMode,
      );

      if (zipEntries.length === 0) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: tolerantMode
            ? "No DDL files could be generated. All selected tables failed validation."
            : "Failed to generate ZIP",
          issues: tolerantErrors.flatMap((item) => (Array.isArray(item.issues) ? item.issues : [])),
          params: {
            selectedTableCount: tables.length,
            successCount: 0,
            skippedCount: tolerantErrors.length,
            tolerantMode,
          },
        });
      }

      if (tolerantMode && includeErrorReport) {
        addTolerantErrorReport(tables, zipEntries, tolerantErrors);
      }

      await streamZipResponse(res, dialect, zipEntries, tolerantErrors, request.sheetName);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (deps.handleReferenceRequestError(err, res)) {
        return;
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      console.error("ZIP export by reference error:", err);
      if (!res.headersSent) {
        return sendApiError(res, {
          status: 500,
          code: "ZIP_GENERATE_FAILED",
          message: "Failed to generate ZIP",
        });
      }
      if (!res.destroyed) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        res.destroy(streamError);
      }
    }
  });

  app.post(api.ddl.exportZip.path, async (req, res) => {
    try {
      const request = api.ddl.exportZip.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;
      const effectiveSettings = hasRequestSettings ? request.settings : await storage.getSettings();
      const { tables, dialect, tolerantMode, includeErrorReport } = request;

      const { zipEntries, tolerantErrors } = collectZipEntries(
        tables,
        dialect,
        effectiveSettings,
        tolerantMode,
      );

      if (zipEntries.length === 0) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: tolerantMode
            ? "No DDL files could be generated. All selected tables failed validation."
            : "Failed to generate ZIP",
          issues: tolerantErrors.flatMap((item) => (Array.isArray(item.issues) ? item.issues : [])),
          params: {
            selectedTableCount: tables.length,
            successCount: 0,
            skippedCount: tolerantErrors.length,
            tolerantMode,
          },
        });
      }

      if (tolerantMode && includeErrorReport) {
        addTolerantErrorReport(tables, zipEntries, tolerantErrors);
      }

      const sheetNameHint = deriveSheetNameHintFromTables(tables);
      await streamZipResponse(res, dialect, zipEntries, tolerantErrors, sheetNameHint);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      if (err instanceof DdlValidationError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.message,
          issues: err.issues,
        });
      }
      console.error("ZIP export error:", err);
      if (!res.headersSent) {
        return sendApiError(res, {
          status: 500,
          code: "ZIP_GENERATE_FAILED",
          message: "Failed to generate ZIP",
        });
      }
      if (!res.destroyed) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        res.destroy(streamError);
      }
    }
  });
}
