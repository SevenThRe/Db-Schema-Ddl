import * as fs from "fs/promises";
import {
  cleanupExpiredDownloadTokens,
  downloadTokenCache,
} from "./shared";

export async function resolveNameFixDownloadTicket(
  token: string,
): Promise<{ outputPath: string; downloadFilename: string }> {
  cleanupExpiredDownloadTokens();
  const ticket = downloadTokenCache.get(token);
  if (!ticket) {
    throw new Error("Download token not found or expired.");
  }
  if (ticket.expiresAt <= Date.now()) {
    downloadTokenCache.delete(token);
    throw new Error("Download token has expired.");
  }
  await fs.access(ticket.outputPath);
  return {
    outputPath: ticket.outputPath,
    downloadFilename: ticket.downloadFilename,
  };
}

