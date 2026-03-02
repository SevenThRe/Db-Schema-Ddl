import type { Express, Request } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import type { DdlSettings } from "@shared/schema";
import { sendApiError } from "../lib/api-error";
import { storage } from "../storage";

interface SettingsRouteDeps {
  applyRuntimeLimitsFromSettings: (settings: DdlSettings) => void;
  canEnableExternalPathWrite: (req: Request) => boolean;
}

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps): void {
  app.get(api.settings.get.path, async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (_err) {
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
      if (settings.allowExternalPathWrite && !deps.canEnableExternalPathWrite(req)) {
        return sendApiError(res, {
          status: 403,
          code: "REQUEST_FAILED",
          message: "allowExternalPathWrite can only be enabled in local Electron mode.",
        });
      }

      const updated = await storage.updateSettings(settings);
      deps.applyRuntimeLimitsFromSettings(updated);
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
}

