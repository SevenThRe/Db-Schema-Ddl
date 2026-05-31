export function formatWorkbenchError(error: unknown, fallback: string): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : fallback;

  return raw
    .replace(/^Error invoking [^:]+:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

export function isCancelledQueryMessage(message: string): boolean {
  return /cancel|cancelled|canceled|キャンセル/i.test(message);
}
