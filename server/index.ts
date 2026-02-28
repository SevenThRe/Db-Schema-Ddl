import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { sendApiError } from "./lib/api-error";
import { runUploadsBackfill } from "./lib/uploads-backfill";
import { isSqliteStorageEnabled } from "./app-config";

const app = express();
const httpServer = createServer(app);
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT?.trim() || "20mb";

const trustProxyConfig = process.env.TRUST_PROXY;
if (trustProxyConfig != null && trustProxyConfig.trim() !== "") {
  const normalized = trustProxyConfig.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    app.set("trust proxy", true);
  } else if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    app.set("trust proxy", false);
  } else {
    app.set("trust proxy", trustProxyConfig);
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: requestBodyLimit,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: requestBodyLimit,
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const API_LOG_MAX_BYTES = 2 * 1024;
const SENSITIVE_LOG_KEY_PATTERN = /(token|path|hash|secret|password|authorization|cookie)/i;

function sanitizeLogValue(value: unknown, keyHint?: string, depth = 0): unknown {
  if (SENSITIVE_LOG_KEY_PATTERN.test(String(keyHint ?? ""))) {
    return "[REDACTED]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}...(truncated)` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array:${value.length}]`;
    }
    const preview = value.slice(0, 5).map((item) => sanitizeLogValue(item, keyHint, depth + 1));
    if (value.length > 5) {
      preview.push(`...(${value.length - 5} more)`);
    }
    return preview;
  }

  if (typeof value === "object") {
    if (depth >= 2) {
      return "[object]";
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeLogValue(item, key, depth + 1);
    }
    return sanitized;
  }

  return String(value);
}

function summarizeApiResponseForLog(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const payload = body as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  if ("status" in payload) {
    summary.status = sanitizeLogValue(payload.status, "status");
  }
  if ("code" in payload) {
    summary.code = sanitizeLogValue(payload.code, "code");
  }
  if ("message" in payload) {
    summary.message = sanitizeLogValue(payload.message, "message");
  }
  if ("params" in payload) {
    summary.params = sanitizeLogValue(payload.params, "params");
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function stringifyLogPayload(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= API_LOG_MAX_BYTES) {
    return serialized;
  }
  return `${serialized.slice(0, API_LOG_MAX_BYTES)}...(truncated)`;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const requestId = (res.getHeader("X-Request-Id") || req.header("x-request-id")) ?? undefined;
      const logPayload: Record<string, unknown> = {
        status: res.statusCode,
        durationMs: duration,
      };
      if (requestId) {
        logPayload.requestId = String(requestId);
      }
      const responseSummary = summarizeApiResponseForLog(capturedJsonResponse);
      if (responseSummary) {
        logPayload.response = responseSummary;
      }
      log(`${req.method} ${path} :: ${stringifyLogPayload(logPayload)}`);
    }
  });

  next();
});

(async () => {
  // Initialize database (SQLite for Electron)
  if (isSqliteStorageEnabled()) {
    const { initializeDatabase } = await import("./init-db");
    await initializeDatabase();
  }

  try {
    await runUploadsBackfill({
      logger: (message) => log(message, "uploads-backfill"),
    });
  } catch (error) {
    log(`startup backfill failed: ${(error as Error).message}`, "uploads-backfill");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const code = status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return sendApiError(res, {
      status,
      code,
      message,
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Electron環境ではローカルホストのみ許可、Web版では全インターフェース許可
  const host = process.env.ELECTRON_MODE === 'true' ? '127.0.0.1' : '0.0.0.0';
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

// Electron main プロセスから httpServer を制御できるようエクスポート
export { httpServer };

// データベースをクリーンアップする関数をエクスポート
export async function cleanup() {
  const { closeDatabase } = await import("./db");
  closeDatabase();
}
