import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { sendApiError } from "./lib/api-error";
import { runUploadsBackfill } from "./lib/uploads-backfill";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database (SQLite for Electron)
  if (process.env.ELECTRON_MODE === 'true' || process.env.USE_SQLITE_STORAGE === 'true') {
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
