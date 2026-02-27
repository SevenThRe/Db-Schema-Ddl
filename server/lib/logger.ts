type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerPayload {
  [key: string]: unknown;
}

function isDebugEnabled(): boolean {
  if (process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true") {
    return true;
  }
  const debug = process.env.DEBUG || "";
  return debug.includes("mcp");
}

function formatLine(level: LogLevel, scope: string, message: string, payload?: LoggerPayload): string {
  const timestamp = new Date().toISOString();
  const payloadText = payload ? ` ${JSON.stringify(payload)}` : "";
  return `[${timestamp}] [${scope}] [${level.toUpperCase()}] ${message}${payloadText}`;
}

function writeToStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function createLogger(scope: string) {
  const debugEnabled = isDebugEnabled();

  return {
    debug(message: string, payload?: LoggerPayload) {
      if (!debugEnabled) return;
      writeToStderr(formatLine("debug", scope, message, payload));
    },
    info(message: string, payload?: LoggerPayload) {
      writeToStderr(formatLine("info", scope, message, payload));
    },
    warn(message: string, payload?: LoggerPayload) {
      writeToStderr(formatLine("warn", scope, message, payload));
    },
    error(message: string, payload?: LoggerPayload) {
      writeToStderr(formatLine("error", scope, message, payload));
    },
  };
}
