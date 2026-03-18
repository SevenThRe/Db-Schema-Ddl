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
