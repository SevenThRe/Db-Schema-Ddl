import type { Express, Response } from "express";
import fs from "fs";
import type multer from "multer";
import { api } from "@shared/routes";
import { APP_DEFAULTS } from "@shared/config";
import { API_ERROR_CODES, API_RESPONSE_MESSAGES, HTTP_STATUS } from "../constants/api-response";
import { HTTP_HEADER_NAMES } from "../constants/http-headers";
import { sendApiError } from "../lib/api-error";
import {
  ROUTE_RUNTIME_DEFAULTS,
  ROUTE_STRING_MARKERS,
  ROUTE_UPLOAD_FILE_NAMING,
} from "../constants/route-runtime";
import { getSheetData } from "../lib/excel";
import { assertValidExcelFile, ExcelValidationError } from "../lib/excel-validation";
import { runParseRegion, runParseWorkbookBundle } from "../lib/excel-executor";
import { taskManager, TaskQueueOverflowError } from "../lib/task-manager";
import { storage } from "../storage";
import type { UploadMiddlewares } from "./module-types";

interface DecodedFilenameRequest {
  decodedFileName?: string;
}

function normalizeOriginalModifiedAt(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }

  const normalizedRaw = String(raw).trim();
  if (!normalizedRaw) {
    return undefined;
  }

  const numeric = Number(normalizedRaw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const isDigitsOnly = /^\d+$/.test(normalizedRaw);
    const isLikelyUnixSeconds = isDigitsOnly && normalizedRaw.length <= 10;
    const ms = isLikelyUnixSeconds ? numeric * 1000 : numeric;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const date = new Date(normalizedRaw);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  return undefined;
}

interface HashTaskResult {
  fileHash: string;
  fileSize: number;
}

function isHashTaskResult(value: unknown): value is HashTaskResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<HashTaskResult>;
  return typeof candidate.fileHash === "string" && typeof candidate.fileSize === "number";
}

interface FileRouteDeps extends UploadMiddlewares {
  upload: multer.Multer;
  uploadsDir: string;
  defaultPkMarkers: string[];
  isExecutorOverloadedError: (error: unknown) => boolean;
  maybeSchedulePrewarm: (filePath: string, fileHash: string, fileSize: number) => void;
  sendTaskQueueBusyError: (res: Response) => void;
}

export function registerFileRoutes(app: Express, deps: FileRouteDeps): void {
  const {
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    uploadRateLimit,
    upload,
    uploadsDir,
    defaultPkMarkers,
    isExecutorOverloadedError,
    maybeSchedulePrewarm,
    sendTaskQueueBusyError,
  } = deps;

  async function resolveParseOptions() {
    const settings = await storage.getSettings();
    return {
      maxConsecutiveEmptyRows:
        settings?.maxConsecutiveEmptyRows ?? ROUTE_RUNTIME_DEFAULTS.maxConsecutiveEmptyRows,
      pkMarkers: settings?.pkMarkers ?? defaultPkMarkers,
    };
  }

  app.get(api.files.list.path, async (_req, res) => {
    const files = await storage.getUploadedFiles();
    res.json(files);
  });

  app.post(
    api.files.upload.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    uploadRateLimit,
    upload.single(ROUTE_STRING_MARKERS.uploadFieldName),
    async (req, res) => {
      if (!req.file) {
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.noFileUploaded,
          message: API_RESPONSE_MESSAGES.noFileUploaded,
        });
      }

      const decodedName =
        (req as DecodedFilenameRequest).decodedFileName ||
        Buffer.from(req.file.originalname, ROUTE_UPLOAD_FILE_NAMING.originalNameEncoding).toString(
          ROUTE_UPLOAD_FILE_NAMING.decodedNameEncoding,
        );
      const originalModifiedAt = normalizeOriginalModifiedAt((req.body as Record<string, unknown>)?.sourceModifiedAt);
      const filePath = req.file.path;
      try {
        assertValidExcelFile(filePath, {
          maxFileSizeMb: APP_DEFAULTS.excel.maxFileSizeMb,
          maxRowsPerSheet: APP_DEFAULTS.excel.maxRowsPerSheet,
        });
      } catch (error) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        if (error instanceof ExcelValidationError) {
          const fileTooLarge = error.issues.some((issue) => issue.code === "FILE_TOO_LARGE");
          return sendApiError(res, {
            status: fileTooLarge ? HTTP_STATUS.PAYLOAD_TOO_LARGE : HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.readExcelFailed,
            message: API_RESPONSE_MESSAGES.excelValidationFailed,
            params: {
              issueCount: error.issues.length,
            },
            issues: error.issues,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.readExcelFailed,
          message: API_RESPONSE_MESSAGES.invalidExcelWorkbook,
        });
      }

      const tempFile = await storage.createUploadedFile({
        filePath,
        originalName: decodedName,
        originalModifiedAt,
        fileHash: ROUTE_STRING_MARKERS.uploadProcessingHash,
        fileSize: 0,
      });

      let task;
      try {
        task = taskManager.createTask("hash", filePath, {
          onComplete: async (result) => {
            try {
              if (!isHashTaskResult(result)) {
                throw new Error("Invalid hash task result");
              }
              const { fileHash, fileSize } = result;
              const existingFile = await storage.findFileByHash(fileHash);

              if (existingFile && existingFile.id !== tempFile.id) {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
                await storage.deleteUploadedFile(tempFile.id);
                return;
              }

              await storage.updateUploadedFile(tempFile.id, { fileHash, fileSize });
              maybeSchedulePrewarm(filePath, fileHash, fileSize);
            } catch (error) {
              console.error("Failed to finalize uploaded file:", error);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              await storage.deleteUploadedFile(tempFile.id);
            }
          },
          onError: async (error) => {
            console.error("Failed to process file:", error);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            await storage.deleteUploadedFile(tempFile.id);
          },
        });
      } catch (error) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          await storage.deleteUploadedFile(tempFile.id);
        } catch (cleanupError) {
          console.warn("Failed to rollback upload after task scheduling failure:", cleanupError);
        }

        if (error instanceof TaskQueueOverflowError) {
          sendTaskQueueBusyError(res);
          return;
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.internalServerError,
          message: API_RESPONSE_MESSAGES.uploadTaskScheduleFailed,
        });
      }

      res.status(HTTP_STATUS.CREATED).json({
        ...tempFile,
        taskId: task.id,
        processing: true,
      });
    },
  );

  app.delete(api.files.remove.path, async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.fileNotFound,
        message: API_RESPONSE_MESSAGES.fileNotFound,
      });
    }
    try {
      let fileCleanupWarning: string | null = null;

      if (file.filePath.startsWith(uploadsDir) && fs.existsSync(file.filePath)) {
        try {
          fs.unlinkSync(file.filePath);
        } catch (cleanupError) {
          fileCleanupWarning = (cleanupError as Error).message;
          console.warn(`[file-delete] failed to remove physical file "${file.filePath}": ${fileCleanupWarning}`);
        }
      }

      await storage.deleteUploadedFile(id);
      res.json({
        message: API_RESPONSE_MESSAGES.fileDeleted,
        fileCleanupWarning,
      });
    } catch (_err) {
      return sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.fileDeleteFailed,
        message: API_RESPONSE_MESSAGES.fileDeleteFailed,
      });
    }
  });

  app.get(api.files.getSheetData.path, async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = decodeURIComponent(req.params.sheetName);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.fileNotFound,
        message: API_RESPONSE_MESSAGES.fileNotFound,
      });
    }
    try {
      const data = getSheetData(file.filePath, sheetName);
      res.json(data);
    } catch (err) {
      return sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.readSheetFailed,
        message: `Failed to read sheet: ${(err as Error).message}`,
        params: { sheetName },
      });
    }
  });

  app.post(
    api.files.parseRegion.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const id = Number(req.params.id);
      const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.fileNotFound,
        message: API_RESPONSE_MESSAGES.fileNotFound,
      });
    }
      try {
        const { sheetName, startRow, endRow, startCol, endCol } = req.body;
        const parseOptions = await resolveParseOptions();
        const tables = await runParseRegion(file.filePath, sheetName, startRow, endRow, startCol, endCol, {
          ...parseOptions,
        });
        res.json(tables);
      } catch (err) {
        if (isExecutorOverloadedError(err)) {
          return sendApiError(res, {
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            code: API_ERROR_CODES.requestFailed,
            message: API_RESPONSE_MESSAGES.excelParserBusy,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.parseRegionFailed,
          message: `Failed to parse region: ${(err as Error).message}`,
        });
      }
    },
  );

  app.get(
    api.files.getSheets.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const id = Number(req.params.id);
      const file = await storage.getUploadedFile(id);
      if (!file) {
        return sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.fileNotFound,
          message: API_RESPONSE_MESSAGES.fileNotFound,
        });
      }

      try {
        const parseOptions = await resolveParseOptions();
        const task = taskManager.createTask("parse_sheets", file.filePath, {
          fileHash: file.fileHash,
          dedupeKey: `${ROUTE_STRING_MARKERS.parseSheetsTaskPrefix}:${file.id}`,
          parseOptions,
          onComplete: () => undefined,
          onError: (error) => {
            console.error("Failed to parse sheets:", error);
          },
        });

        res.json({
          taskId: task.id,
          processing: true,
        });
      } catch (err) {
        if (err instanceof TaskQueueOverflowError) {
          sendTaskQueueBusyError(res);
          return;
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.readExcelFailed,
          message: API_RESPONSE_MESSAGES.readExcelFailed,
        });
      }
    },
  );

  app.get(
    api.files.getTableInfo.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const id = Number(req.params.id);
      const rawSheetName = req.params.sheetName;
      const sheetName = Array.isArray(rawSheetName) ? rawSheetName[0] : rawSheetName;
      const file = await storage.getUploadedFile(id);
      if (!file) {
        return sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.fileNotFound,
          message: API_RESPONSE_MESSAGES.fileNotFound,
        });
      }

      try {
        if (!sheetName) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: API_RESPONSE_MESSAGES.sheetNameRequired,
          });
        }

        const parseOptions = await resolveParseOptions();
        const task = taskManager.createTask("parse_table", file.filePath, {
          fileHash: file.fileHash,
          sheetName,
          dedupeKey: `${ROUTE_STRING_MARKERS.parseTableTaskPrefix}:${file.id}:${sheetName}`,
          parseOptions,
          onComplete: () => undefined,
          onError: (error) => {
            console.error("Failed to parse table:", error);
          },
        });

        res.json({
          taskId: task.id,
          processing: true,
        });
      } catch (err) {
        if (err instanceof TaskQueueOverflowError) {
          sendTaskQueueBusyError(res);
          return;
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.parseSheetFailed,
          message: `Failed to parse sheet: ${(err as Error).message}`,
          params: { sheetName: sheetName ?? null },
        });
      }
    },
  );

  app.get(api.tasks.get.path, async (req, res) => {
    const id = req.params.id;
    const task = taskManager.getTask(id);
    if (!task) {
      return sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.taskNotFound,
        message: API_RESPONSE_MESSAGES.taskNotFound,
      });
    }
    res.json({
      id: task.id,
      taskType: task.type,
      status: task.status,
      progress: task.progress,
      error: task.error,
      result: task.result,
      createdAt: task.createdAt,
      updatedAt: new Date(),
    });
  });

  app.get(
    api.files.getSearchIndex.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const id = Number(req.params.id);
      const file = await storage.getUploadedFile(id);
      if (!file) {
        return sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.fileNotFound,
          message: API_RESPONSE_MESSAGES.fileNotFound,
        });
      }

      try {
        const parseOptions = await resolveParseOptions();
        const bundle = await runParseWorkbookBundle(
          file.filePath,
          parseOptions,
          file.fileHash,
        );
        res.setHeader(HTTP_HEADER_NAMES.parseMode, bundle.stats.parseMode);
        res.json(bundle.searchIndex);
      } catch (err) {
        if (isExecutorOverloadedError(err)) {
          return sendApiError(res, {
            status: HTTP_STATUS.SERVICE_UNAVAILABLE,
            code: API_ERROR_CODES.requestFailed,
            message: API_RESPONSE_MESSAGES.excelParserBusy,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.searchIndexFailed,
          message: API_RESPONSE_MESSAGES.searchIndexFailed,
        });
      }
    },
  );
}
