import type { Express, Request } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { getSheetNames, parseTableDefinitions } from "./lib/excel";
import { generateDDL } from "./lib/ddl";
import { z } from "zod";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

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

    const file = await storage.createUploadedFile({
      filePath: req.file.path,
      originalName: req.file.originalname,
    });

    res.status(201).json(file);
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

  // Seed with the attached file if not exists
  // We can't easily "upload" it via API here, but we can insert into DB if file exists
  const attachedFile = 'attached_assets/30.データベース定義書-給与_ISI_20260209_1770863427874.xlsx';
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
