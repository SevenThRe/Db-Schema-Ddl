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
  const client = await openConnection(connection, databaseName);
  try {
    return await work(client);
  } finally {
    await client.end();
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

  const encryptedPassword =
    input.rememberPassword === false ? undefined : await encryptDbPassword(input.password);

  const created = await storage.createDbConnection({
    name: input.name.trim(),
    dialect: "mysql",
    host: input.host.trim(),
    port: input.port,
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

  let encryptedPassword = existing.encryptedPassword;
  if (input.clearSavedPassword || input.rememberPassword === false) {
    encryptedPassword = undefined;
  }
  if (input.password) {
    encryptedPassword = await encryptDbPassword(input.password);
  }

  const updated = await storage.updateDbConnection(id, {
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    encryptedPassword,
    rememberPassword: input.rememberPassword,
    sslMode: input.sslMode,
    passwordStorage: "electron-safe-storage",
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
      const [databaseRows] = await client.query<Array<RowDataPacket & { name: string }>>(
        "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
      );

      return {
        success: true,
        message: "Connection test succeeded.",
        serverVersion: versionRows[0]?.version,
        databaseCount: databaseRows.length,
      } satisfies DbConnectionTestResponse;
    });

    await storage.updateDbConnection(id, {
      lastTestStatus: "ok",
      lastTestMessage: result.message,
      lastTestedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed.";
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

  return withMySqlConnection(connection, undefined, async (client) => {
    const [rows] = await client.query<Array<RowDataPacket & { name: string }>>(
      "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
    );

    return rows.map((row) => ({
      name: row.name,
      isSelected: row.name === connection.lastSelectedDatabase,
    }));
  });
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
