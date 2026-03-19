import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import type {
  DbConnectionRecord,
  DbConnectionSummary,
  DbConnectionTestResponse,
  DbConnectionUpsertRequest,
  DbDatabaseOption,
} from "@shared/schema";
import { storage } from "../../../storage";
import { decryptDbPassword, encryptDbPassword } from "./credential-vault";
import {
  hasDbConnectionIdentityChanged,
  isDatabaseEnumerationUnavailable,
  normalizeDbConnectionEndpoint,
  normalizeDbConnectionError,
} from "./connection-service-helpers";

function toConnectionSummary(connection: DbConnectionRecord): DbConnectionSummary {
  const { encryptedPassword, ...summary } = connection;
  return {
    ...summary,
    passwordStored: Boolean(encryptedPassword),
  };
}

function resolveSslOption(sslMode: DbConnectionRecord["sslMode"]): mysql.SslOptions | string | undefined {
  if (sslMode === "required") {
    return {};
  }
  return undefined;
}

async function resolvePassword(connection: DbConnectionRecord): Promise<string> {
  const password = await decryptDbPassword(connection.encryptedPassword);
  if (!password) {
    throw new Error("No saved password is available for this connection.");
  }
  return password;
}

async function openConnection(
  connection: DbConnectionRecord,
  databaseName?: string,
): Promise<mysql.Connection> {
  const password = await resolvePassword(connection);
  return mysql.createConnection({
    host: connection.host,
    port: connection.port,
    user: connection.username,
    password,
    database: databaseName,
    ssl: resolveSslOption(connection.sslMode),
  });
}

export async function withMySqlConnection<T>(
  connection: DbConnectionRecord,
  databaseName: string | undefined,
  work: (client: mysql.Connection) => Promise<T>,
): Promise<T> {
  let client: mysql.Connection | null = null;
  try {
    client = await openConnection(connection, databaseName);
    return await work(client);
  } catch (error) {
    throw normalizeDbConnectionError(error, databaseName);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

export async function listDbConnections(): Promise<DbConnectionSummary[]> {
  return storage.listDbConnections();
}

export async function getDbConnectionRecordOrThrow(id: number): Promise<DbConnectionRecord> {
  const connection = await storage.getDbConnection(id);
  if (!connection) {
    throw new Error("DB connection not found.");
  }
  return connection;
}

export async function createDbConnection(
  input: DbConnectionUpsertRequest,
): Promise<DbConnectionSummary> {
  if (!input.password) {
    throw new Error("Password is required when creating a connection.");
  }

  const normalizedEndpoint = normalizeDbConnectionEndpoint(input);
  const encryptedPassword =
    input.rememberPassword === false ? undefined : await encryptDbPassword(input.password);

  const created = await storage.createDbConnection({
    name: input.name.trim(),
    dialect: "mysql",
    host: normalizedEndpoint.host,
    port: normalizedEndpoint.port,
    username: input.username.trim(),
    encryptedPassword,
    passwordStorage: "electron-safe-storage",
    rememberPassword: input.rememberPassword,
    sslMode: input.sslMode,
    lastSelectedDatabase: undefined,
    lastTestStatus: "unknown",
    lastTestMessage: undefined,
    lastTestedAt: undefined,
  });

  return toConnectionSummary(created);
}

export async function updateDbConnection(
  id: number,
  input: DbConnectionUpsertRequest,
): Promise<DbConnectionSummary> {
  const existing = await getDbConnectionRecordOrThrow(id);
  const connectionIdentityChanged = hasDbConnectionIdentityChanged(existing, input);
  const normalizedEndpoint = normalizeDbConnectionEndpoint(input);

  let encryptedPassword = existing.encryptedPassword;
  if (input.clearSavedPassword || input.rememberPassword === false) {
    encryptedPassword = undefined;
  }
  if (input.password) {
    encryptedPassword = await encryptDbPassword(input.password);
  }

  const updated = await storage.updateDbConnection(id, {
    name: input.name.trim(),
    host: normalizedEndpoint.host,
    port: normalizedEndpoint.port,
    username: input.username.trim(),
    encryptedPassword,
    rememberPassword: input.rememberPassword,
    sslMode: input.sslMode,
    passwordStorage: "electron-safe-storage",
    lastSelectedDatabase: connectionIdentityChanged ? undefined : existing.lastSelectedDatabase,
    lastTestStatus: connectionIdentityChanged ? "unknown" : existing.lastTestStatus,
    lastTestMessage: connectionIdentityChanged ? undefined : existing.lastTestMessage,
    lastTestedAt: connectionIdentityChanged ? undefined : existing.lastTestedAt,
  });

  if (!updated) {
    throw new Error("DB connection not found.");
  }

  return toConnectionSummary(updated);
}

export async function deleteDbConnection(id: number): Promise<void> {
  await getDbConnectionRecordOrThrow(id);
  await storage.deleteDbConnection(id);
}

export async function testDbConnection(id: number): Promise<DbConnectionTestResponse> {
  const connection = await getDbConnectionRecordOrThrow(id);

  try {
    const result = await withMySqlConnection(connection, undefined, async (client) => {
      const [versionRows] = await client.query<Array<RowDataPacket & { version: string }>>(
        "SELECT VERSION() AS version",
      );
      try {
        const [databaseRows] = await client.query<Array<RowDataPacket & { name: string }>>(
          "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
        );

        return {
          success: true,
          message: "连接测试成功。",
          serverVersion: versionRows[0]?.version,
          databaseCount: databaseRows.length,
        } satisfies DbConnectionTestResponse;
      } catch (error) {
        if (!isDatabaseEnumerationUnavailable(error)) {
          throw error;
        }

        return {
          success: true,
          message: "连接测试成功，但当前账号无法枚举 database，请手动输入要读取的 database 名称。",
          serverVersion: versionRows[0]?.version,
        } satisfies DbConnectionTestResponse;
      }
    });

    await storage.updateDbConnection(id, {
      lastTestStatus: "ok",
      lastTestMessage: result.message,
      lastTestedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const message = normalizeDbConnectionError(error).message;
    await storage.updateDbConnection(id, {
      lastTestStatus: "failed",
      lastTestMessage: message,
      lastTestedAt: new Date().toISOString(),
    });

    return {
      success: false,
      message,
    };
  }
}

export async function listDatabasesForConnection(id: number): Promise<DbDatabaseOption[]> {
  const connection = await getDbConnectionRecordOrThrow(id);

  let databases: DbDatabaseOption[];
  try {
    databases = await withMySqlConnection(connection, undefined, async (client) => {
      const [rows] = await client.query<Array<RowDataPacket & { name: string }>>(
        "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
      );

      return rows.map((row) => ({
        name: row.name,
        isSelected: row.name === connection.lastSelectedDatabase,
      }));
    });
  } catch (error) {
    if (!isDatabaseEnumerationUnavailable(error)) {
      throw error;
    }

    return connection.lastSelectedDatabase
      ? [{
          name: connection.lastSelectedDatabase,
          isSelected: true,
        }]
      : [];
  }

  if (
    connection.lastSelectedDatabase &&
    !databases.some((database) => database.name === connection.lastSelectedDatabase)
  ) {
    await storage.updateDbConnection(id, {
      lastSelectedDatabase: undefined,
      lastTestMessage: `之前选中的数据库 ${connection.lastSelectedDatabase} 已不存在，已清除选择。`,
    });

    return databases.map((database) => ({
      ...database,
      isSelected: false,
    }));
  }

  return databases;
}

export async function selectDatabaseForConnection(
  id: number,
  databaseName: string,
): Promise<DbConnectionSummary> {
  const updated = await storage.updateDbConnection(id, {
    lastSelectedDatabase: databaseName,
  });

  if (!updated) {
    throw new Error("DB connection not found.");
  }

  return toConnectionSummary(updated);
}
