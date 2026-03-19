import type { DbConnectionRecord, DbConnectionUpsertRequest } from "@shared/schema";

export function hasDbConnectionIdentityChanged(
  existing: Pick<DbConnectionRecord, "host" | "port" | "username">,
  input: Pick<DbConnectionUpsertRequest, "host" | "port" | "username">,
): boolean {
  const normalizedInput = normalizeDbConnectionEndpoint(input);
  return (
    existing.host.trim() !== normalizedInput.host ||
    existing.port !== normalizedInput.port ||
    existing.username.trim() !== input.username.trim()
  );
}

export function normalizeDbConnectionEndpoint(
  input: Pick<DbConnectionUpsertRequest, "host" | "port">,
): { host: string; port: number } {
  const rawHost = input.host.trim();
  const hostPortMatch = rawHost.match(/^([^:]+):(\d{1,5})$/);

  if (!hostPortMatch) {
    return {
      host: rawHost,
      port: input.port,
    };
  }

  const parsedPort = Number(hostPortMatch[2]);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return {
      host: rawHost,
      port: input.port,
    };
  }

  return {
    host: hostPortMatch[1]!.trim(),
    port: parsedPort,
  };
}

export function normalizeDbConnectionError(error: unknown, databaseName?: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;

  if (message === "No saved password is available for this connection.") {
    return new Error("该连接没有已保存密码。请重新输入密码并保存后再读取 database。");
  }

  if (code === "ER_BAD_DB_ERROR") {
    if (databaseName) {
      return new Error(`数据库 ${databaseName} 在当前连接中不存在，请重新选择 database。`);
    }
    return new Error("当前选择的数据库不存在，请重新选择 database。");
  }

  if (code === "ER_ACCESS_DENIED_ERROR") {
    return new Error("数据库用户名或密码不正确，请检查连接凭据后重试。");
  }

  if (code === "ECONNREFUSED") {
    return new Error("无法连接到数据库主机，请检查 host 和 port 是否正确。");
  }

  return error instanceof Error ? error : new Error(message);
}

export function isDatabaseEnumerationUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;

  if (
    code === "ER_DBACCESS_DENIED_ERROR" ||
    code === "ER_TABLEACCESS_DENIED_ERROR" ||
    code === "ER_SPECIFIC_ACCESS_DENIED_ERROR" ||
    code === "ER_ACCESS_DENIED_ERROR"
  ) {
    return true;
  }

  return /information_schema/i.test(message) || /show databases/i.test(message);
}
