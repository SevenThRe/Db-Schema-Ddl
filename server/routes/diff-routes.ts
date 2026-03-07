import type { Express } from "express";
import archiver from "archiver";
import { z } from "zod";
import { api } from "@shared/routes";
import {
  confirmRenameSuggestions,
  getSchemaDiffHistory,
  previewSchemaDiff,
  previewSchemaDiffAlterSql,
} from "../lib/schema-diff";
import { sendApiError } from "../lib/api-error";
import { API_ERROR_CODES, API_RESPONSE_MESSAGES, HTTP_STATUS } from "../constants/api-response";
import type { ParseMiddlewares } from "./module-types";

function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function toSafeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, 64);
}

function buildContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encodedFilename = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export function registerDiffRoutes(app: Express, middlewares: ParseMiddlewares): void {
  const { globalProtectRateLimit, globalProtectInFlightLimit, parseRateLimit } = middlewares;

  app.post(
    api.diff.preview.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.diff.preview.input.parse(req.body);
        const response = await previewSchemaDiff(request);
        res.json(response);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: error.errors[0].message,
          });
        }
        if (
          error instanceof Error &&
          (error.message.includes("No historical file found") ||
            error.message.includes("No baseline candidate available"))
        ) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: error.message,
          });
        }
        if (
          error instanceof Error &&
          (error.message.includes("not found") || error.message.includes("does not exist"))
        ) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.fileNotFound,
            message: error.message,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.diffPreviewFailed,
          message: API_RESPONSE_MESSAGES.diffPreviewFailed,
        });
      }
    },
  );

  app.post(
    api.diff.confirm.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.diff.confirm.input.parse(req.body);
        const response = await confirmRenameSuggestions(request);
        res.json(response);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: error.errors[0].message,
          });
        }
        if (error instanceof Error && error.message.includes("Diff result not found")) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.diffNotFound,
            message: API_RESPONSE_MESSAGES.diffNotFound,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.diffConfirmFailed,
          message: API_RESPONSE_MESSAGES.diffConfirmFailed,
        });
      }
    },
  );

  app.post(
    api.diff.alterPreview.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.diff.alterPreview.input.parse(req.body);
        const response = await previewSchemaDiffAlterSql(request);
        res.json(response);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: error.errors[0].message,
          });
        }
        if (error instanceof Error && error.message.includes("Diff result not found")) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.diffNotFound,
            message: API_RESPONSE_MESSAGES.diffNotFound,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.diffAlterPreviewFailed,
          message: API_RESPONSE_MESSAGES.diffAlterPreviewFailed,
        });
      }
    },
  );

  app.post(
    api.diff.alterExport.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.diff.alterExport.input.parse(req.body);
        const response = await previewSchemaDiffAlterSql(request);
        const timestamp = formatTimestamp();
        const baseName = `alter_${request.dialect}_${timestamp}`;

        if (request.packaging === "single_file") {
          const content =
            response.artifacts.length > 0
              ? response.artifacts.map((artifact) => artifact.sql).join("\n\n")
              : "-- No ALTER statements generated.";
          const filename = `${baseName}.sql`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Content-Disposition", buildContentDisposition(filename));
          res.send(content);
          return;
        }

        const zipFilename = `${baseName}.zip`;
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (error) => {
          if (!res.headersSent) {
            sendApiError(res, {
              status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
              code: API_ERROR_CODES.diffAlterExportFailed,
              message: API_RESPONSE_MESSAGES.diffAlterExportFailed,
            });
            return;
          }
          if (!res.destroyed) {
            res.destroy(error);
          }
        });

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", buildContentDisposition(zipFilename));
        archive.pipe(res);
        if (response.artifacts.length === 0) {
          archive.append("-- No ALTER statements generated.", { name: "README.txt" });
        } else {
          response.artifacts.forEach((artifact, index) => {
            const safeName = toSafeFilename(artifact.artifactName || `alter_${index + 1}.sql`) || `alter_${index + 1}.sql`;
            archive.append(artifact.sql, { name: safeName.endsWith(".sql") ? safeName : `${safeName}.sql` });
          });
        }
        await archive.finalize();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: error.errors[0].message,
          });
        }
        if (error instanceof Error && error.message.includes("Diff result not found")) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.diffNotFound,
            message: API_RESPONSE_MESSAGES.diffNotFound,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.diffAlterExportFailed,
          message: API_RESPONSE_MESSAGES.diffAlterExportFailed,
        });
      }
    },
  );

  app.get(
    api.diff.history.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      const newFileId = Number(req.params.newFileId);
      if (!Number.isFinite(newFileId) || newFileId <= 0) {
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.invalidRequest,
          message: "newFileId must be a positive number",
        });
      }
      try {
        const response = await getSchemaDiffHistory(newFileId);
        res.json(response);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.fileNotFound,
            message: error.message,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: API_ERROR_CODES.diffHistoryFailed,
          message: API_RESPONSE_MESSAGES.diffHistoryFailed,
        });
      }
    },
  );
}
