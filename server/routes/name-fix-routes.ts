import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { API_ERROR_CODES, API_RESPONSE_MESSAGES, HTTP_STATUS } from "../constants/api-response";
import { HTTP_HEADER_NAMES } from "../constants/http-headers";
import { NAME_FIX_RUNTIME_MARKERS } from "../lib/name-fix-service/constants";
import { sendApiError } from "../lib/api-error";
import {
  applyNameFixPlanById,
  getNameFixJobDetail,
  previewNameFixPlan,
  resolveNameFixDownloadTicket,
  rollbackNameFixJobById,
} from "../lib/name-fix-service";
import type { ParseMiddlewares } from "./module-types";

interface NameFixRouteDeps extends ParseMiddlewares {}

export function registerNameFixRoutes(app: Express, deps: NameFixRouteDeps): void {
  const { globalProtectRateLimit, globalProtectInFlightLimit, parseRateLimit } = deps;

  app.post(
    api.nameFix.preview.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.preview.input.parse(req.body);
        const response = await previewNameFixPlan(request);
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes(NAME_FIX_RUNTIME_MARKERS.fileNotFoundText)) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.fileNotFound,
            message,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.requestFailed,
          message,
        });
      }
    },
  );

  app.post(
    api.nameFix.apply.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.apply.input.parse(req.body);
        const response = await applyNameFixPlanById(request);
        res.setHeader(HTTP_HEADER_NAMES.nameFixJobId, response.jobId);
        res.setHeader(HTTP_HEADER_NAMES.nameFixPlanHash, response.planHash);
        res.setHeader(HTTP_HEADER_NAMES.nameFixChangedTables, String(response.summary.changedTableCount));
        res.setHeader(HTTP_HEADER_NAMES.nameFixChangedColumns, String(response.summary.changedColumnCount));
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes(NAME_FIX_RUNTIME_MARKERS.notFoundText)) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.taskNotFound,
            message,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.requestFailed,
          message,
        });
      }
    },
  );

  app.post(
    api.nameFix.rollback.path,
    globalProtectRateLimit,
    globalProtectInFlightLimit,
    parseRateLimit,
    async (req, res) => {
      try {
        const request = api.nameFix.rollback.input.parse(req.body);
        const response = await rollbackNameFixJobById(request);
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: API_ERROR_CODES.invalidRequest,
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes(NAME_FIX_RUNTIME_MARKERS.notFoundText)) {
          return sendApiError(res, {
            status: HTTP_STATUS.NOT_FOUND,
            code: API_ERROR_CODES.taskNotFound,
            message,
          });
        }
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.requestFailed,
          message,
        });
      }
    },
  );

  app.get(api.nameFix.getJob.path, async (req, res) => {
    try {
      const jobId = req.params.id;
      const detail = await getNameFixJobDetail(jobId);
      res.json(detail);
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes(NAME_FIX_RUNTIME_MARKERS.notFoundText)) {
        return sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.taskNotFound,
          message,
        });
      }
      return sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.requestFailed,
        message,
      });
    }
  });

  app.get(api.nameFix.download.path, async (req, res) => {
    try {
      const token = String(req.params.token ?? "").trim();
      if (!token) {
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.invalidRequest,
          message: API_RESPONSE_MESSAGES.downloadTokenRequired,
        });
      }
      const ticket = await resolveNameFixDownloadTicket(token);
      res.download(ticket.outputPath, ticket.downloadFilename);
    } catch (err) {
      const message = (err as Error).message;
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes(NAME_FIX_RUNTIME_MARKERS.notFoundText) ||
        normalizedMessage.includes(NAME_FIX_RUNTIME_MARKERS.expiredText)
      ) {
        return sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.fileNotFound,
          message,
        });
      }
      return sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.requestFailed,
        message,
      });
    }
  });
}
