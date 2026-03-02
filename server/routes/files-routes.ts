import type { Express, Response } from "express";
import fs from "fs";
import type multer from "multer";
import { api } from "@shared/routes";
import { sendApiError } from "../lib/api-error";
import { getSheetData } from "../lib/excel";
import { runParseRegion, runParseWorkbookBundle } from "../lib/excel-executor";
import { taskManager, TaskQueueOverflowError } from "../lib/task-manager";
import { storage } from "../storage";
import type { UploadMiddlewares } from "./module-types";

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

  app.get(api.files.list.path, async (_req, res) => {
    const files = await storage.getUploadedFiles();
    res.json(files);
  });

  app.post(
    api.files.upload.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    uploadRateLimit,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) {
        return sendApiError(res, {
          status: 400,
          code: "NO_FILE_UPLOADED",
          message: "No file uploaded",
        });
      }

      const decodedName = (req as any).decodedFileName || req.file.originalname;
      const filePath = req.file.path;

      const tempFile = await storage.createUploadedFile({
        filePath,
        originalName: decodedName,
        fileHash: "processing",
        fileSize: 0,
      });

      let task;
      try {
        task = taskManager.createTask("hash", filePath, {
          onComplete: async (result) => {
            try {
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
          status: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to schedule upload processing task",
        });
      }

      res.status(201).json({
        ...tempFile,
        taskId: task.id,
        processing: true,
      });
    },
  );

  app.delete("/api/files/:id", async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
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
        message: "File deleted",
        fileCleanupWarning,
      });
    } catch (_err) {
      return sendApiError(res, {
        status: 500,
        code: "FILE_DELETE_FAILED",
        message: "Failed to delete file",
      });
    }
  });

  app.get("/api/files/:id/sheets/:sheetName/data", async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = decodeURIComponent(req.params.sheetName);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }
    try {
      const data = getSheetData(file.filePath, sheetName);
      res.json(data);
    } catch (err) {
      return sendApiError(res, {
        status: 400,
        code: "READ_SHEET_FAILED",
        message: `Failed to read sheet: ${(err as Error).message}`,
        params: { sheetName },
      });
    }
  });

  app.post(
    "/api/files/:id/parse-region",
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const id = Number(req.params.id);
      const file = await storage.getUploadedFile(id);
      if (!file) {
        return sendApiError(res, {
          status: 404,
          code: "FILE_NOT_FOUND",
          message: "File not found",
        });
      }
      try {
        const { sheetName, startRow, endRow, startCol, endCol } = req.body;
        const settings = await storage.getSettings();
        const tables = await runParseRegion(file.filePath, sheetName, startRow, endRow, startCol, endCol, {
          maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
          pkMarkers: settings?.pkMarkers ?? defaultPkMarkers,
        });
        res.json(tables);
      } catch (err) {
        if (isExecutorOverloadedError(err)) {
          return sendApiError(res, {
            status: 503,
            code: "REQUEST_FAILED",
            message: "Excel parser is busy. Please retry shortly.",
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "PARSE_REGION_FAILED",
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
          status: 404,
          code: "FILE_NOT_FOUND",
          message: "File not found",
        });
      }

      try {
        const settings = await storage.getSettings();
        const task = taskManager.createTask("parse_sheets", file.filePath, {
          fileHash: file.fileHash,
          dedupeKey: `parse_sheets:${file.id}`,
          parseOptions: {
            maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
            pkMarkers: settings?.pkMarkers ?? defaultPkMarkers,
          },
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
          status: 500,
          code: "READ_EXCEL_FAILED",
          message: "Failed to read Excel file",
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
          status: 404,
          code: "FILE_NOT_FOUND",
          message: "File not found",
        });
      }

      try {
        if (!sheetName) {
          return sendApiError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: "Sheet name is required",
          });
        }

        const settings = await storage.getSettings();
        const task = taskManager.createTask("parse_table", file.filePath, {
          fileHash: file.fileHash,
          sheetName,
          dedupeKey: `parse_table:${file.id}:${sheetName}`,
          parseOptions: {
            maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
            pkMarkers: settings?.pkMarkers ?? defaultPkMarkers,
          },
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
          status: 400,
          code: "PARSE_SHEET_FAILED",
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
        status: 404,
        code: "TASK_NOT_FOUND",
        message: "Task not found",
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
          status: 404,
          code: "FILE_NOT_FOUND",
          message: "File not found",
        });
      }

      try {
        const settings = await storage.getSettings();
        const bundle = await runParseWorkbookBundle(
          file.filePath,
          {
            maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
            pkMarkers: settings?.pkMarkers ?? defaultPkMarkers,
          },
          file.fileHash,
        );
        res.setHeader("X-Parse-Mode", bundle.stats.parseMode);
        res.json(bundle.searchIndex);
      } catch (err) {
        if (isExecutorOverloadedError(err)) {
          return sendApiError(res, {
            status: 503,
            code: "REQUEST_FAILED",
            message: "Excel parser is busy. Please retry shortly.",
          });
        }
        return sendApiError(res, {
          status: 500,
          code: "SEARCH_INDEX_FAILED",
          message: "Failed to generate search index",
        });
      }
    },
  );
}

