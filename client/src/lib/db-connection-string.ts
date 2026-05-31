import type { DbConnectionConfig, DbDriver, DbSslMode } from "@shared/schema";

export const DEFAULT_DB_PORTS: Record<DbDriver, number> = {
  mysql: 3306,
  postgres: 5432,
};

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Map the various sslmode spellings used by Postgres, MySQL, and JDBC URLs to
// our driver-neutral DbSslMode. Unknown tokens return undefined (caller keeps
// the default).
export function parseSslModeToken(token: string | undefined): DbSslMode | undefined {
  const value = token?.trim().toLowerCase().replace(/_/g, "-");
  if (!value) return undefined;
  switch (value) {
    case "disable":
    case "disabled":
    case "false":
    case "0":
    case "off":
      return "disable";
    case "prefer":
    case "preferred":
    case "allow":
      return "prefer";
    case "require":
    case "required":
    case "true":
    case "1":
    case "on":
      return "require";
    case "verify-ca":
    case "verifyca":
      return "verify-ca";
    case "verify-full":
    case "verify-identity":
    case "verifyidentity":
    case "full":
      return "verify-full";
    default:
      return undefined;
  }
}

function sslModeFromQuery(source: string): DbSslMode | undefined {
  const match = source.match(/[?&](?:ssl-?mode)=([^&\s]+)/i);
  return parseSslModeToken(match?.[1]);
}

export function autoNameFrom(host: string, port: number, database: string): string {
  return database ? `${host}:${port}@${database}` : "";
}

export interface ReleaseVerificationBootstrapInput {
  driver?: DbDriver;
  connectionName?: string;
  connectionString?: string;
  readonly?: boolean;
  defaultSchema?: string;
}

export interface ReleaseVerificationBootstrapResult {
  config: DbConnectionConfig | null;
  error?: string;
}

// 接続文字列をパースして DbConnectionConfig の一部を返す
// 対応フォーマット:
//   mysql://user:pass@host:port/db
//   postgresql://user:pass@host:port/db
//   jdbc:mysql://host:port/db?user=u&password=p
//   jdbc:postgresql://host:port/db?user=u&password=p
//   host=h port=p dbname=d user=u password=p  (psql キーバリュー形式)
//   DB_HOST=h DB_PORT=p DB_NAME=d DB_USER=u DB_PASSWORD=p  (.env 形式)
//   JetBrains DataSourceSettings XML / clipboard dump
export function parseConnectionString(input: string): Partial<DbConnectionConfig> | null {
  const source = input.trim();
  if (!source) {
    return null;
  }

  const urlMatch = source.match(
    /^(?:jdbc:)?(mysql|postgresql|postgres):\/\/([^:@/\s]*)(?::([^@/\s]*))?@([^:/\s]+)(?::(\d+))?\/([^?#\s]*)/i,
  );
  if (urlMatch) {
    const [, proto, user, pass, host, portText, database] = urlMatch;
    const driver: DbDriver =
      proto.toLowerCase().startsWith("postgres") ? "postgres" : "mysql";
    const port = portText ? Number(portText) : DEFAULT_DB_PORTS[driver];
    const queryUser = source.match(/[?&]user=([^&\s]+)/i)?.[1] ?? user;
    const queryPassword = source.match(/[?&]password=([^&\s]+)/i)?.[1] ?? pass;
    return {
      driver,
      host: host || "localhost",
      port,
      database: database || "",
      username: queryUser || "",
      password: queryPassword || "",
      sslMode: sslModeFromQuery(source),
    };
  }

  if (/\bhost\s*=/.test(source) || /\bdbname\s*=/.test(source)) {
    const kv = (key: string) =>
      source.match(new RegExp(`\\b${key}\\s*=\\s*([^\\s]+)`))?.[1] ?? "";
    const portText = kv("port");
    const driver: DbDriver = "postgres";
    return {
      driver,
      host: kv("host") || "localhost",
      port: portText ? Number(portText) : DEFAULT_DB_PORTS[driver],
      database: kv("dbname") || kv("database"),
      username: kv("user") || kv("username"),
      password: kv("password"),
      sslMode: parseSslModeToken(kv("sslmode")),
    };
  }

  if (/DB_HOST\s*=/i.test(source) || /DATABASE_URL\s*=/i.test(source)) {
    const urlLine = source.match(/DATABASE_URL\s*=\s*["']?([^\s"']+)/i)?.[1];
    if (urlLine) {
      return parseConnectionString(urlLine);
    }

    const envValue = (key: string) =>
      source.match(new RegExp(`${key}\\s*=\\s*["']?([^"'\\s]+)`, "i"))?.[1] ?? "";
    const driverRaw = envValue("DB_DRIVER") || envValue("DB_CONNECTION") || "mysql";
    const driver: DbDriver =
      driverRaw.toLowerCase().startsWith("postgres") ? "postgres" : "mysql";
    const portText = envValue("DB_PORT");
    return {
      driver,
      host: envValue("DB_HOST") || "localhost",
      port: portText ? Number(portText) : DEFAULT_DB_PORTS[driver],
      database: envValue("DB_NAME") || envValue("DB_DATABASE"),
      username: envValue("DB_USER") || envValue("DB_USERNAME"),
      password: envValue("DB_PASSWORD") || envValue("DB_PASS"),
      sslMode: parseSslModeToken(envValue("DB_SSLMODE") || envValue("DB_SSL_MODE")),
    };
  }

  if (/<data-source\b/i.test(source) || /<jdbc-url>/i.test(source)) {
    const readTag = (tagName: string) =>
      source.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"))?.[1]?.trim() ?? "";
    const readAttr = (attrName: string) =>
      source.match(new RegExp(`${attrName}="([^"]+)"`, "i"))?.[1]?.trim() ?? "";

    const jdbcUrl = readTag("jdbc-url");
    const userName = readTag("user-name");
    const dataSourceName = readAttr("name");
    const product = readAttr("product");
    const driverRef = readTag("driver-ref") || readAttr("dbms");

    const parsedUrl = jdbcUrl ? parseConnectionString(jdbcUrl) : null;
    if (parsedUrl) {
      return {
        ...parsedUrl,
        username: userName || parsedUrl.username,
        name: dataSourceName || undefined,
        driver: parsedUrl.driver,
      };
    }

    const driverText = `${product} ${driverRef}`.toLowerCase();
    const driver: DbDriver = driverText.includes("postgres") ? "postgres" : "mysql";
    const host = source.match(/jdbc:[^:]+:\/\/([^:/\s]+)(?::(\d+))?\/([^\s<]+)/i);
    if (host) {
      return {
        driver,
        host: host[1] || "localhost",
        port: host[2] ? Number(host[2]) : DEFAULT_DB_PORTS[driver],
        database: host[3] || "",
        username: userName || "",
        name: dataSourceName || "",
      };
    }
  }

  return null;
}

export function buildReleaseVerificationBootstrapConfig(
  input: ReleaseVerificationBootstrapInput,
): ReleaseVerificationBootstrapResult {
  const connectionString = normalizeOptionalText(input.connectionString);
  if (!connectionString) {
    return { config: null };
  }

  const parsed = parseConnectionString(connectionString);
  if (!parsed) {
    return {
      config: null,
      error:
        "Live verification bootstrap connection string could not be parsed by the connection-center importer.",
    };
  }

  if (input.driver && parsed.driver && parsed.driver !== input.driver) {
    return {
      config: null,
      error: `Live verification bootstrap driver mismatch: expected ${input.driver} but parsed ${parsed.driver}.`,
    };
  }

  const driver = parsed.driver ?? input.driver;
  if (!driver) {
    return {
      config: null,
      error:
        "Live verification bootstrap connection string did not resolve a supported driver.",
    };
  }

  const host = normalizeOptionalText(parsed.host) ?? "localhost";
  const port =
    typeof parsed.port === "number" && Number.isFinite(parsed.port) && parsed.port > 0
      ? parsed.port
      : DEFAULT_DB_PORTS[driver];
  const database = normalizeOptionalText(parsed.database) ?? "";
  const username = normalizeOptionalText(parsed.username) ?? "";
  const password = parsed.password ?? "";
  const connectionName =
    normalizeOptionalText(input.connectionName) ??
    normalizeOptionalText(parsed.name) ??
    normalizeOptionalText(autoNameFrom(host, port, database)) ??
    `Release Verification ${driver}`;

  return {
    config: {
      id: `__release-verification__${driver}`,
      name: connectionName,
      driver,
      host,
      port,
      database,
      username,
      password,
      environment: "test",
      readonly: input.readonly === true,
      favorite: false,
      groupName: "Release Verification",
      defaultSchema: normalizeOptionalText(input.defaultSchema),
      notes:
        "Auto-managed release verification connection created from DBSCHEMA_LIVE_VERIFY_CONNECTION_STRING.",
    },
  };
}
