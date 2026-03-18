import type { Express, Request, Response } from "express";
import { api } from "@shared/routes";
import { extensionIdSchema } from "@shared/schema";
import { sendApiError } from "../lib/api-error";
import { API_ERROR_CODES, HTTP_STATUS } from "../constants/api-response";
import {
  getKnownExtension,
  getKnownExtensionCatalog,
  getKnownExtensionLifecycle,
  listKnownExtensions,
  setExtensionEnabled,
} from "../lib/extensions/registry";

function parseExtensionIdFromRequest(req: Request, res: Response) {
  const parsed = extensionIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    sendApiError(res, {
      status: HTTP_STATUS.BAD_REQUEST,
      code: API_ERROR_CODES.invalidRequest,
      message: "Unknown extension id.",
      issues: parsed.error.issues,
    });
    return undefined;
  }
  return parsed.data;
}

export function registerExtensionRoutes(app: Express): void {
  app.get(api.extensions.list.path, async (_req, res) => {
    try {
      const result = await listKnownExtensions();
      res.json(api.extensions.list.responses[200].parse(result));
    } catch (error) {
      sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.requestFailed,
        message: error instanceof Error ? error.message : "Failed to load extensions.",
      });
    }
  });

  app.get(api.extensions.get.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    try {
      const extension = await getKnownExtension(extensionId);
      if (!extension) {
        sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.requestFailed,
          message: "Extension not found.",
        });
        return;
      }
      res.json(api.extensions.get.responses[200].parse(extension));
    } catch (error) {
      sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.requestFailed,
        message: error instanceof Error ? error.message : "Failed to load extension.",
      });
    }
  });

  app.post(api.extensions.enable.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    const payload = api.extensions.enable.input.safeParse({
      extensionId,
    });
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid extension enable request.",
        issues: payload.error.issues,
      });
      return;
    }

    const updated = await setExtensionEnabled(payload.data.extensionId, true);
    if (!updated) {
      sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.requestFailed,
        message: "Extension is not installed.",
      });
      return;
    }
    res.json(api.extensions.enable.responses[200].parse(updated));
  });

  app.post(api.extensions.disable.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    const payload = api.extensions.disable.input.safeParse({
      extensionId,
    });
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid extension disable request.",
        issues: payload.error.issues,
      });
      return;
    }

    const updated = await setExtensionEnabled(payload.data.extensionId, false);
    if (!updated) {
      sendApiError(res, {
        status: HTTP_STATUS.NOT_FOUND,
        code: API_ERROR_CODES.requestFailed,
        message: "Extension is not installed.",
      });
      return;
    }
    res.json(api.extensions.disable.responses[200].parse(updated));
  });

  app.get(api.extensions.catalog.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    try {
      const catalog = await getKnownExtensionCatalog(extensionId);
      if (catalog === undefined) {
        sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.requestFailed,
          message: "Extension not found.",
        });
        return;
      }
      res.json(api.extensions.catalog.responses[200].parse(catalog));
    } catch (error) {
      sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.requestFailed,
        message: error instanceof Error ? error.message : "Failed to load extension catalog.",
      });
    }
  });

  app.get(api.extensions.lifecycle.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    try {
      const lifecycle = await getKnownExtensionLifecycle(extensionId);
      if (lifecycle === undefined && extensionId !== "db-management") {
        sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.requestFailed,
          message: "Extension not found.",
        });
        return;
      }
      res.json(api.extensions.lifecycle.responses[200].parse(lifecycle ?? null));
    } catch (error) {
      sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.requestFailed,
        message: error instanceof Error ? error.message : "Failed to load extension lifecycle state.",
      });
    }
  });

  app.post(api.extensions.uninstall.path, async (req, res) => {
    const extensionId = parseExtensionIdFromRequest(req, res);
    if (!extensionId) {
      return;
    }

    const payload = api.extensions.uninstall.input.safeParse({
      extensionId,
      action: "uninstall",
    });
    if (!payload.success) {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.invalidRequest,
        message: "Invalid extension uninstall request.",
        issues: payload.error.issues,
      });
      return;
    }

    if (process.env.ELECTRON_MODE !== "true") {
      sendApiError(res, {
        status: HTTP_STATUS.BAD_REQUEST,
        code: API_ERROR_CODES.requestFailed,
        message: "Extension uninstall is only available in Electron mode.",
      });
      return;
    }

    try {
      const { extensionService } = await import("../../electron/extensions");
      await extensionService.uninstallExtension(payload.data.extensionId);
      const extension = await getKnownExtension(payload.data.extensionId);
      if (!extension) {
        sendApiError(res, {
          status: HTTP_STATUS.NOT_FOUND,
          code: API_ERROR_CODES.requestFailed,
          message: "Extension not found.",
        });
        return;
      }
      res.json(api.extensions.uninstall.responses[200].parse(extension));
    } catch (error) {
      sendApiError(res, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: API_ERROR_CODES.requestFailed,
        message: error instanceof Error ? error.message : "Failed to uninstall extension.",
      });
    }
  });
}
