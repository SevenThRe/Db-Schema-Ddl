import type { Express, Request } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import archiver from "archiver";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { getSheetData } from "./lib/excel";
import { generateDDL, substituteFilenameSuffix } from "./lib/ddl";
import { DdlValidationError } from "./lib/ddl-validation";
import { taskManager } from "./lib/task-manager";
import { runBuildSearchIndex, runParseRegion } from "./lib/excel-executor";
import { z } from "zod";
import { sendApiError } from "./lib/api-error";

// アップロードディレクトリの取得と作成
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Custom storage to handle UTF-8 filenames and file deduplication
const customStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Properly decode UTF-8 filename (multer encodes as latin1)
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Store decoded name in request for later use
    (req as any).decodedFileName = decodedName;

    // Generate unique filename: hash_timestamp_originalname.ext
    const ext = path.extname(decodedName);
    const nameWithoutExt = path.basename(decodedName, ext);
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(decodedName + timestamp).digest('hex').slice(0, 8);
    const filename = `${hash}_${timestamp}_${nameWithoutExt}${ext}`;

    cb(null, filename);
  }
});

// xlsx / xls のみ受け付けるフィルター（MIMEタイプと拡張子の両方を確認）
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'application/octet-stream',                                           // 一部ブラウザでのフォールバック
]);
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);

const upload = multer({
  storage: customStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(decodedName).toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Excel ファイル（.xlsx / .xls）のみアップロード可能です'));
    }
  },
});

const DEFAULT_PK_MARKERS = ["\u3007"];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.files.list.path, async (req, res) => {
    const files = await storage.getUploadedFiles();
    res.json(files);
  });

  app.post(api.files.upload.path, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return sendApiError(res, {
        status: 400,
        code: "NO_FILE_UPLOADED",
        message: "No file uploaded",
      });
    }

    // Use the decoded filename we stored in multer config
    const decodedName = (req as any).decodedFileName || req.file.originalname;
    const filePath = req.file.path;

    // Create a temporary file entry without hash (will be updated later)
    const tempFile = await storage.createUploadedFile({
      filePath,
      originalName: decodedName,
      fileHash: 'processing',
      fileSize: 0,
    });

    // Create a background task to process the file
    const task = taskManager.createTask('hash', filePath, {
      onComplete: async (result) => {
        const { fileHash, fileSize } = result;

        // Check if a file with the same hash already exists
        const existingFile = await storage.findFileByHash(fileHash);

        if (existingFile && existingFile.id !== tempFile.id) {
          // File already exists, remove the newly uploaded duplicate
          fs.unlinkSync(filePath);
          await storage.deleteUploadedFile(tempFile.id);
        } else {
          // ハッシュ計算完了後、ファイルレコードを実際の値で更新する
          await storage.updateUploadedFile(tempFile.id, { fileHash, fileSize });
        }
      },
      onError: async (error) => {
        console.error('Failed to process file:', error);
        // Clean up the file and database entry
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await storage.deleteUploadedFile(tempFile.id);
      }
    });

    // Return immediately with the file and task ID
    res.status(201).json({
      ...tempFile,
      taskId: task.id,
      processing: true,
    });
  });

  // Delete file
  app.delete('/api/files/:id', async (req, res) => {
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
      // アップロードディレクトリ内のファイルのみ削除
      if (file.filePath.startsWith(UPLOADS_DIR) && fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }
      await storage.deleteUploadedFile(id);
      res.json({ message: 'File deleted' });
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "FILE_DELETE_FAILED",
        message: "Failed to delete file",
      });
    }
  });

  // Get raw sheet data (2D array) for spreadsheet viewer
  app.get('/api/files/:id/sheets/:sheetName/data', async (req, res) => {
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
        params: {
          sheetName,
        },
      });
    }
  });

  // Parse a selected region of a sheet
  app.post('/api/files/:id/parse-region', async (req, res) => {
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
        pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      });
      res.json(tables);
    } catch (err) {
      return sendApiError(res, {
        status: 400,
        code: "PARSE_REGION_FAILED",
        message: `Failed to parse region: ${(err as Error).message}`,
      });
    }
  });

  app.get(api.files.getSheets.path, async (req, res) => {
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
      // Get settings for parse options
      const settings = await storage.getSettings();

      // Always use background task to avoid blocking
      const task = taskManager.createTask('parse_sheets', file.filePath, {
        parseOptions: {
          maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
          pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
        },
        onComplete: (result) => {
          // Task completed, frontend will poll for results
        },
        onError: (error) => {
          console.error('Failed to parse sheets:', error);
        }
      });

      // Return task ID for polling
      res.json({
        taskId: task.id,
        processing: true,
      });
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "READ_EXCEL_FAILED",
        message: "Failed to read Excel file",
      });
    }
  });

  app.get(api.files.getTableInfo.path, async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = req.params.sheetName;
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return sendApiError(res, {
        status: 404,
        code: "FILE_NOT_FOUND",
        message: "File not found",
      });
    }

    try {
      // Get settings for parse options
      const settings = await storage.getSettings();

      // Use background task to avoid blocking
      const task = taskManager.createTask('parse_table', file.filePath, {
        sheetName,
        parseOptions: {
          maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
          pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
        },
        onComplete: (result) => {
          // Task completed, frontend will poll for results
        },
        onError: (error) => {
          console.error('Failed to parse table:', error);
        }
      });

      // Return task ID for polling
      res.json({
        taskId: task.id,
        processing: true,
      });
    } catch (err) {
      return sendApiError(res, {
        status: 400,
        code: "PARSE_SHEET_FAILED",
        message: `Failed to parse sheet: ${(err as Error).message}`,
        params: {
          sheetName,
        },
      });
    }
  });

  // Get task status
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

  // Get search index for a file
  app.get(api.files.getSearchIndex.path, async (req, res) => {
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
      const searchIndex = await runBuildSearchIndex(file.filePath, {
        maxConsecutiveEmptyRows: settings?.maxConsecutiveEmptyRows ?? 10,
        pkMarkers: settings?.pkMarkers ?? DEFAULT_PK_MARKERS,
      });
      res.json(searchIndex);
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "SEARCH_INDEX_FAILED",
        message: "Failed to generate search index",
      });
    }
  });

  app.post(api.ddl.generate.path, async (req, res) => {
    try {
      const request = api.ddl.generate.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;

      // 兼容直接调用 /api/generate-ddl 且未传 settings 的场景：
      // 优先使用持久化设置，而不是仅使用代码内置默认值
      const effectiveRequest = hasRequestSettings
        ? request
        : {
            ...request,
            settings: await storage.getSettings(),
          };

      const ddl = generateDDL(effectiveRequest);
      res.json({ ddl });
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
      return sendApiError(res, {
        status: 500,
        code: "DDL_GENERATE_FAILED",
        message: "Failed to generate DDL",
      });
    }
  });

  app.post(api.ddl.exportZip.path, async (req, res) => {
    try {
      const request = api.ddl.exportZip.input.parse(req.body);
      const hasRequestSettings = req.body && typeof req.body === "object" && req.body.settings != null;
      const effectiveSettings = hasRequestSettings ? request.settings : await storage.getSettings();
      const { tables, dialect } = request;

      // Create a zip archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="ddl_${dialect}_${Date.now()}.zip"`);

      // Pipe archive to response
      archive.pipe(res);

      // Generate individual DDL for each table and add to ZIP
      const prefix = effectiveSettings?.exportFilenamePrefix || "Crt_";
      const suffixTemplate = effectiveSettings?.exportFilenameSuffix || "";
      const authorName = effectiveSettings?.authorName || "ISI";

      tables.forEach((table) => {
        // Generate DDL for single table
        const singleTableDdl = generateDDL({
          tables: [table],
          dialect,
          settings: effectiveSettings
        });

        // Substitute variables in suffix for this specific table
        const suffix = substituteFilenameSuffix(suffixTemplate, table, authorName);

        // Create filename for this table
        const filename = `${prefix}${table.physicalTableName}${suffix}.sql`;

        // Add to ZIP
        archive.append(singleTableDdl, { name: filename });
      });

      // Handle errors
      archive.on('error', (err) => {
        throw err;
      });

      // Finalize the archive
      await archive.finalize();

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
      console.error('ZIP export error:', err);
      if (!res.headersSent) {
        return sendApiError(res, {
          status: 500,
          code: "ZIP_GENERATE_FAILED",
          message: "Failed to generate ZIP",
        });
      }
    }
  });

  // Settings routes
  app.get(api.settings.get.path, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (err) {
      return sendApiError(res, {
        status: 500,
        code: "SETTINGS_GET_FAILED",
        message: "Failed to get settings",
      });
    }
  });

  app.put(api.settings.update.path, async (req, res) => {
    try {
      const settings = api.settings.update.input.parse(req.body);
      const updated = await storage.updateSettings(settings);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: err.errors[0].message,
        });
      }
      return sendApiError(res, {
        status: 500,
        code: "SETTINGS_UPDATE_FAILED",
        message: "Failed to update settings",
      });
    }
  });

  // サンプルファイルの初期登録（Electron環境では RESOURCES_PATH から取得）
  const attachedFile = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx')
    : 'attached_assets/30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx';
  if (fs.existsSync(attachedFile)) {
    const existing = await storage.getUploadedFiles();
    if (existing.length === 0) {
      // Calculate hash for the seed file
      const fileBuffer = fs.readFileSync(attachedFile);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      await storage.createUploadedFile({
        filePath: attachedFile,
        originalName: '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx',
        fileHash,
        fileSize: fileBuffer.length,
      });
    }
  }

  return httpServer;
}
