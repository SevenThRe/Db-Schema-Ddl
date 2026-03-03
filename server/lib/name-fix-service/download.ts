import * as fs from "fs/promises";
import { NAME_FIX_RUNTIME_MESSAGES } from "./constants";
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
    throw new Error(NAME_FIX_RUNTIME_MESSAGES.downloadTokenNotFound);
  }
  if (ticket.expiresAt <= Date.now()) {
    downloadTokenCache.delete(token);
    throw new Error(NAME_FIX_RUNTIME_MESSAGES.downloadTokenExpired);
  }
  await fs.access(ticket.outputPath);
  return {
    outputPath: ticket.outputPath,
    downloadFilename: ticket.downloadFilename,
  };
}
