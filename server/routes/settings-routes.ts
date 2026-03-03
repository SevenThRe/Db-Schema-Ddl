import type { Express, Request } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import type { DdlSettings } from "@shared/schema";
import { API_ERROR_CODES, API_RESPONSE_MESSAGES, HTTP_STATUS } from "../constants/api-response";
import { sendApiError } from "../lib/api-error";
import type { ExcelExecutorDiagnostics } from "../lib/excel-executor";
import { storage } from "../storage";

interface RuntimeDiagnosticsPayload {
  excelExecutor: ExcelExecutorDiagnostics;
}

interface SettingsRouteDeps {
  applyRuntimeLimitsFromSettings: (settings: DdlSettings) => void;
  canEnableExternalPathWrite: (req: Request) => boolean;
  getRuntimeDiagnostics: () => RuntimeDiagnosticsPayload;
}

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps): void {
  app.get(api.settings.get.path, async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (_err) {
      return sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.settingsGetFailed,
        message: API_RESPONSE_MESSAGES.settingsGetFailed,
      });
    }
  });

  app.get(api.settings.getRuntime.path, (_req, res) => {
    res.json(deps.getRuntimeDiagnostics());
  });

  app.put(api.settings.update.path, async (req, res) => {
    try {
      const settings = api.settings.update.input.parse(req.body);
      if (settings.allowExternalPathWrite && !deps.canEnableExternalPathWrite(req)) {
        return sendApiError(res, {
          status: HTTP_STATUS.FORBIDDEN,
          code: API_ERROR_CODES.requestFailed,
          message: API_RESPONSE_MESSAGES.externalPathWriteRestricted,
        });
      }

      const updated = await storage.updateSettings(settings);
      deps.applyRuntimeLimitsFromSettings(updated);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendApiError(res, {
          status: HTTP_STATUS.BAD_REQUEST,
          code: API_ERROR_CODES.invalidRequest,
          message: err.errors[0].message,
        });
      }
      return sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.settingsUpdateFailed,
        message: API_RESPONSE_MESSAGES.settingsUpdateFailed,
      });
    }
  });
}
