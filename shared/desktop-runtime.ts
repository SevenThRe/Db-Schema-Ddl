export function normalizeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

export function shouldPresentFatalDialog(options?: {
  requested?: boolean;
  shuttingDown?: boolean;
  hasShownDialog?: boolean;
}): boolean {
  return Boolean(options?.requested) && !Boolean(options?.shuttingDown) && !Boolean(options?.hasShownDialog);
}

export function formatDesktopCheckpoint(
  checkpoint: string,
  metadata?: Record<string, unknown>,
): string {
  const suffix = metadata && Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";
  return `[checkpoint:${checkpoint}]${suffix}`;
}

export interface ParsedDesktopCheckpoint {
  name: string;
  metadata: Record<string, unknown>;
  rawLine: string;
}

export function parseDesktopCheckpointLine(line: string): ParsedDesktopCheckpoint | null {
  const match = line.match(/\[checkpoint:([^\]]+)\](?:\s+(\{.*\}))?/);
  if (!match?.[1]) {
    return null;
  }

  let metadata: Record<string, unknown> = {};
  if (match[2]) {
    try {
      const parsed = JSON.parse(match[2]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = {};
    }
  }

  return {
    name: match[1],
    metadata,
    rawLine: line,
  };
}

export function extractDesktopCheckpoints(logContents: string): ParsedDesktopCheckpoint[] {
  return logContents
    .split(/\r?\n/)
    .map((line) => parseDesktopCheckpointLine(line))
    .filter((checkpoint): checkpoint is ParsedDesktopCheckpoint => checkpoint !== null);
}

export function normalizeElectronBoundaryErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  let message = error.message.trim();
  message = message.replace(/^Error invoking remote method '[^']+':\s*/i, "");
  message = message.replace(/^Error:\s*/i, "").trim();

  if (/Official extension manifest asset was not found on GitHub releases/i.test(message)) {
    return "官方扩展暂未发布，当前还没有可下载的安装包。";
  }

  if (/GitHub request failed/i.test(message)) {
    return "暂时无法获取 GitHub 官方发布信息，请稍后重试。";
  }

  return message || fallbackMessage;
}
