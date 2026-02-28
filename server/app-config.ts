export const serverConfig = {
  storage: {
    useSqlite: true,
  },
} as const;

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isSqliteStorageEnabled(): boolean {
  if (process.env.ELECTRON_MODE === "true") {
    return true;
  }

  if (isEnabled(process.env.USE_SQLITE_STORAGE)) {
    return true;
  }

  if (process.env.DATABASE_URL) {
    return false;
  }

  return serverConfig.storage.useSqlite;
}
