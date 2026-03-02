import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
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
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("file not found")) {
          return sendApiError(res, {
            status: 404,
            code: "FILE_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
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
        res.setHeader("X-NameFix-JobId", response.jobId);
        res.setHeader("X-NameFix-PlanHash", response.planHash);
        res.setHeader("X-NameFix-Changed-Tables", String(response.summary.changedTableCount));
        res.setHeader("X-NameFix-Changed-Columns", String(response.summary.changedColumnCount));
        res.json(response);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return sendApiError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("not found")) {
          return sendApiError(res, {
            status: 404,
            code: "TASK_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
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
            status: 400,
            code: "INVALID_REQUEST",
            message: err.errors[0].message,
          });
        }
        const message = (err as Error).message;
        if (message.toLowerCase().includes("not found")) {
          return sendApiError(res, {
            status: 404,
            code: "TASK_NOT_FOUND",
            message,
          });
        }
        return sendApiError(res, {
          status: 400,
          code: "REQUEST_FAILED",
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
      if (message.toLowerCase().includes("not found")) {
        return sendApiError(res, {
          status: 404,
          code: "TASK_NOT_FOUND",
          message,
        });
      }
      return sendApiError(res, {
        status: 400,
        code: "REQUEST_FAILED",
        message,
      });
    }
  });

  app.get(api.nameFix.download.path, async (req, res) => {
    try {
      const token = String(req.params.token ?? "").trim();
      if (!token) {
        return sendApiError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Download token is required.",
        });
      }
      const ticket = await resolveNameFixDownloadTicket(token);
      res.download(ticket.outputPath, ticket.downloadFilename);
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("expired")) {
        return sendApiError(res, {
          status: 404,
          code: "FILE_NOT_FOUND",
          message,
        });
      }
      return sendApiError(res, {
        status: 400,
        code: "REQUEST_FAILED",
        message,
      });
    }
  });
}

