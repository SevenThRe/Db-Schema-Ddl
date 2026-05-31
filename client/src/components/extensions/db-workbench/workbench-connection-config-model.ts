import {
  DEFAULT_DB_PORTS,
  autoNameFrom,
} from "@/lib/db-connection-string";
import type {
  DbConnectionConfig,
  DbDiscoveredEndpoint,
  DbDriver,
} from "@shared/schema";

export const CONNECTION_GROUP_UNGROUPED = "未分组";

export type ConnectionEnvironmentFilter = "all" | "dev" | "test" | "prod";

export type ConnectionGroupSection = {
  groupName: string;
  items: DbConnectionConfig[];
};

export function emptyConnectionConfig(): DbConnectionConfig {
  return {
    id: "",
    name: "",
    driver: "mysql",
    host: "localhost",
    port: DEFAULT_DB_PORTS.mysql,
    database: "",
    username: "root",
    password: "",
    favorite: false,
  };
}

export function configFromDiscoveredEndpoint(
  candidate: DbDiscoveredEndpoint,
): DbConnectionConfig {
  const database = candidate.databaseHint ?? "";
  const base = emptyConnectionConfig();
  return {
    ...base,
    name: autoNameFrom(candidate.host, candidate.port, database),
    driver: candidate.driver,
    host: candidate.host,
    port: candidate.port,
    database,
    username: candidate.usernameHint ?? base.username,
    defaultSchema: candidate.defaultSchemaHint,
  };
}

export function isAutoConnectionName(cfg: DbConnectionConfig): boolean {
  return (
    cfg.name === "" ||
    cfg.name === autoNameFrom(cfg.host, cfg.port, cfg.database)
  );
}

export function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeConnectionConfig(
  config: DbConnectionConfig,
): DbConnectionConfig {
  return {
    ...config,
    environment: config.environment ?? undefined,
    favorite: config.favorite === true ? true : undefined,
    groupName: normalizeOptionalText(config.groupName),
    colorTag: normalizeOptionalText(config.colorTag),
    defaultSchema: normalizeOptionalText(config.defaultSchema),
    notes: normalizeOptionalText(config.notes),
  };
}

export function buildConnectionSearchText(
  connection: DbConnectionConfig,
): string {
  return [
    connection.name,
    connection.host,
    connection.database,
    connection.username,
    connection.groupName,
    connection.notes,
    connection.environment,
    connection.defaultSchema,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildConnectionGroupSections(
  connections: DbConnectionConfig[],
  filters: {
    search: string;
    environment: ConnectionEnvironmentFilter;
    favoriteOnly: boolean;
  },
): ConnectionGroupSection[] {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const filtered = connections.filter((connection) => {
    if (filters.favoriteOnly && connection.favorite !== true) {
      return false;
    }
    if (
      filters.environment !== "all" &&
      connection.environment !== filters.environment
    ) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return buildConnectionSearchText(connection).includes(normalizedSearch);
  });

  const buckets = new Map<string, DbConnectionConfig[]>();
  for (const connection of filtered) {
    const key =
      normalizeOptionalText(connection.groupName) ?? CONNECTION_GROUP_UNGROUPED;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(connection);
    } else {
      buckets.set(key, [connection]);
    }
  }

  return Array.from(buckets.entries())
    .map(([groupName, items]) => ({
      groupName,
      items: items.sort((left, right) => {
        if ((left.favorite === true) !== (right.favorite === true)) {
          return left.favorite === true ? -1 : 1;
        }
        return (left.name || left.database).localeCompare(
          right.name || right.database,
        );
      }),
    }))
    .sort((left, right) => {
      if (
        left.groupName === CONNECTION_GROUP_UNGROUPED &&
        right.groupName !== CONNECTION_GROUP_UNGROUPED
      ) {
        return 1;
      }
      if (
        right.groupName === CONNECTION_GROUP_UNGROUPED &&
        left.groupName !== CONNECTION_GROUP_UNGROUPED
      ) {
        return -1;
      }
      return left.groupName.localeCompare(right.groupName);
    });
}

export function asColorInputValue(value: string | undefined): string {
  return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value ?? "")
    ? (value as string)
    : "#3b82f6";
}

export function resolveLiveVerificationConnection(
  connections: DbConnectionConfig[],
  target?: {
    driver?: DbDriver;
    connectionId?: string;
    connectionName?: string;
  },
): DbConnectionConfig | null {
  if (connections.length === 0) {
    return null;
  }

  if (target?.connectionId) {
    const matchedById = connections.find(
      (connection) => connection.id === target.connectionId,
    );
    if (matchedById) {
      return matchedById;
    }
  }

  if (target?.connectionName) {
    const normalizedName = target.connectionName.trim().toLowerCase();
    const matchedByName = connections.find(
      (connection) => connection.name.trim().toLowerCase() === normalizedName,
    );
    if (matchedByName) {
      return matchedByName;
    }
  }

  if (target?.driver) {
    return (
      connections.find((connection) => connection.driver === target.driver) ??
      null
    );
  }

  return connections[0] ?? null;
}
