import type { Express, Request } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { getSheetNames, parseTableDefinitions, getSheetData, parseSheetRegion } from "./lib/excel";
import { generateDDL } from "./lib/ddl";
import { z } from "zod";

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

const upload = multer({
  storage: customStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

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
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Use the decoded filename we stored in multer config
    const decodedName = (req as any).decodedFileName || req.file.originalname;

    const file = await storage.createUploadedFile({
      filePath: req.file.path,
      originalName: decodedName,
    });

    res.status(201).json(file);
  });

  // Delete file
  app.delete('/api/files/:id', async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    try {
      // アップロードディレクトリ内のファイルのみ削除
      if (file.filePath.startsWith(UPLOADS_DIR) && fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }
      await storage.deleteUploadedFile(id);
      res.json({ message: 'File deleted' });
    } catch (err) {
      res.status(500).json({ message: 'Failed to delete file' });
    }
  });

  // Get raw sheet data (2D array) for spreadsheet viewer
  app.get('/api/files/:id/sheets/:sheetName/data', async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = decodeURIComponent(req.params.sheetName);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    try {
      const data = getSheetData(file.filePath, sheetName);
      res.json(data);
    } catch (err) {
      res.status(400).json({ message: `Failed to read sheet: ${(err as Error).message}` });
    }
  });

  // Parse a selected region of a sheet
  app.post('/api/files/:id/parse-region', async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    try {
      const { sheetName, startRow, endRow, startCol, endCol } = req.body;
      const tables = parseSheetRegion(file.filePath, sheetName, startRow, endRow, startCol, endCol);
      res.json(tables);
    } catch (err) {
      res.status(400).json({ message: `Failed to parse region: ${(err as Error).message}` });
    }
  });

  app.get(api.files.getSheets.path, async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    try {
      const sheets = getSheetNames(file.filePath);
      res.json(sheets);
    } catch (err) {
      res.status(500).json({ message: 'Failed to read Excel file' });
    }
  });

  app.get(api.files.getTableInfo.path, async (req, res) => {
    const id = Number(req.params.id);
    const sheetName = req.params.sheetName;
    const file = await storage.getUploadedFile(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    try {
      const tables = parseTableDefinitions(file.filePath, sheetName);
      res.json(tables);
    } catch (err) {
      res.status(400).json({ message: `Failed to parse sheet: ${(err as Error).message}` });
    }
  });

  app.post(api.ddl.generate.path, async (req, res) => {
    try {
      const request = api.ddl.generate.input.parse(req.body);
      const ddl = generateDDL(request);
      res.json({ ddl });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: 'Failed to generate DDL' });
    }
  });

  // サンプルファイルの初期登録（Electron環境では RESOURCES_PATH から取得）
  const attachedFile = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx')
    : 'attached_assets/30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx';
  if (fs.existsSync(attachedFile)) {
    const existing = await storage.getUploadedFiles();
    if (existing.length === 0) {
      await storage.createUploadedFile({
        filePath: attachedFile,
        originalName: '30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx',
      });
    }
  }

  return httpServer;
}
