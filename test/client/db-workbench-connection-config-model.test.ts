import assert from "node:assert/strict";
import test from "node:test";
import type { DbConnectionConfig } from "../../shared/schema";
import { autoNameFrom } from "../../client/src/lib/db-connection-string";
import {
  asColorInputValue,
  buildConnectionGroupSections,
  buildConnectionSearchText,
  CONNECTION_GROUP_UNGROUPED,
  configFromDiscoveredEndpoint,
  DB_SSL_MODES,
  DEFAULT_SSL_MODE,
  effectiveSslMode,
  emptyConnectionConfig,
  isAutoConnectionName,
  normalizeConnectionConfig,
  resolveLiveVerificationConnection,
  sslModeAlwaysEncrypts,
  sslModeRequiresRootCert,
} from "../../client/src/components/extensions/db-workbench/workbench-connection-config-model";

function connection(
  patch: Partial<DbConnectionConfig> = {},
): DbConnectionConfig {
  return {
    id: "conn-1",
    name: "Main MySQL",
    driver: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database: "app",
    username: "root",
    password: "",
    ...patch,
  };
}

test("connection config model builds safe defaults and discovered endpoint drafts", () => {
  const empty = emptyConnectionConfig();
  assert.equal(empty.driver, "mysql");
  assert.equal(empty.host, "localhost");
  assert.equal(empty.port, 3306);
  assert.equal(empty.username, "root");

  const discovered = configFromDiscoveredEndpoint({
    driver: "postgres",
    host: "127.0.0.1",
    port: 5432,
    source: "postgres-ssl-probe",
    confidence: "medium",
    detail: "PostgreSQL detected",
    databaseHint: "dbtools_lab",
    usernameHint: "app",
    defaultSchemaHint: "tenant",
  });

  assert.equal(discovered.driver, "postgres");
  assert.equal(discovered.database, "dbtools_lab");
  assert.equal(discovered.username, "app");
  assert.equal(discovered.defaultSchema, "tenant");
  assert.match(discovered.name, /127\.0\.0\.1/);
});

test("connection config model preserves manual names and normalizes metadata", () => {
  assert.equal(
    isAutoConnectionName(
      connection({ name: autoNameFrom("127.0.0.1", 3306, "app") }),
    ),
    true,
  );
  assert.equal(isAutoConnectionName(connection({ name: "Production" })), false);

  const normalized = normalizeConnectionConfig(
    connection({
      environment: undefined,
      favorite: false,
      groupName: "  ops  ",
      colorTag: "  #10b981  ",
      defaultSchema: "  public  ",
      notes: "  daily driver  ",
    }),
  );

  assert.equal(normalized.favorite, undefined);
  assert.equal(normalized.groupName, "ops");
  assert.equal(normalized.colorTag, "#10b981");
  assert.equal(normalized.defaultSchema, "public");
  assert.equal(normalized.notes, "daily driver");
  assert.equal(asColorInputValue("#abc"), "#abc");
  assert.equal(asColorInputValue("not-a-color"), "#3b82f6");
});

test("connection config model treats TLS as prefer-by-default and normalizes cert paths", () => {
  // Old configs without sslMode behave as the backward-compatible "prefer".
  assert.equal(DEFAULT_SSL_MODE, "prefer");
  assert.equal(effectiveSslMode(connection()), "prefer");
  assert.equal(effectiveSslMode(connection({ sslMode: "verify-full" })), "verify-full");

  // require/verify-* are always-encrypted; disable/prefer are not guaranteed.
  assert.equal(sslModeAlwaysEncrypts("disable"), false);
  assert.equal(sslModeAlwaysEncrypts("prefer"), false);
  assert.equal(sslModeAlwaysEncrypts("require"), true);
  assert.equal(sslModeAlwaysEncrypts("verify-full"), true);

  // Only verify-ca / verify-full require a root CA to validate the server.
  assert.deepEqual(
    DB_SSL_MODES.filter(sslModeRequiresRootCert),
    ["verify-ca", "verify-full"],
  );

  const normalized = normalizeConnectionConfig(
    connection({
      sslMode: "require",
      sslRootCert: "  /etc/ssl/ca.pem  ",
      sslClientCert: "   ",
      sslClientKey: undefined,
    }),
  );
  assert.equal(normalized.sslMode, "require");
  assert.equal(normalized.sslRootCert, "/etc/ssl/ca.pem");
  assert.equal(normalized.sslClientCert, undefined);
  assert.equal(normalized.sslClientKey, undefined);

  // "prefer" is the implicit default and is dropped so saved configs stay minimal.
  const preferNormalized = normalizeConnectionConfig(connection({ sslMode: "prefer" }));
  assert.equal(preferNormalized.sslMode, undefined);
});

test("connection config model centralizes search and live verification selection", () => {
  const mysql = connection({
    id: "mysql-1",
    name: "Reporting MySQL",
    notes: "finance warehouse",
    groupName: "BI",
  });
  const postgres = connection({
    id: "pg-1",
    name: "Tenant Postgres",
    driver: "postgres",
    port: 5432,
    database: "tenant",
    defaultSchema: "app",
  });

  assert.match(buildConnectionSearchText(mysql), /finance warehouse/);
  assert.match(buildConnectionSearchText(mysql), /bi/);
  assert.equal(
    resolveLiveVerificationConnection([mysql, postgres], {
      connectionId: "pg-1",
    })?.id,
    "pg-1",
  );
  assert.equal(
    resolveLiveVerificationConnection([mysql, postgres], {
      connectionName: "tenant postgres",
    })?.id,
    "pg-1",
  );
  assert.equal(
    resolveLiveVerificationConnection([mysql, postgres], {
      driver: "postgres",
    })?.id,
    "pg-1",
  );
  assert.equal(resolveLiveVerificationConnection([], { driver: "mysql" }), null);
});

test("connection config model groups filtered connections deterministically", () => {
  const alpha = connection({
    id: "alpha",
    name: "Alpha Local",
    groupName: "  Local  ",
  });
  const favorite = connection({
    id: "favorite",
    name: "Favorite Prod",
    environment: "prod",
    favorite: true,
    groupName: "Production",
    notes: "finance warehouse",
  });
  const plainProd = connection({
    id: "plain",
    name: "Plain Prod",
    environment: "prod",
    groupName: "Production",
  });
  const ungrouped = connection({
    id: "ungrouped",
    name: "Ungrouped Dev",
    environment: "dev",
    groupName: "   ",
  });

  const sections = buildConnectionGroupSections(
    [ungrouped, plainProd, favorite, alpha],
    {
      search: "",
      environment: "all",
      favoriteOnly: false,
    },
  );

  assert.deepEqual(
    sections.map((section) => section.groupName),
    ["Local", "Production", CONNECTION_GROUP_UNGROUPED],
  );
  assert.deepEqual(
    sections.find((section) => section.groupName === "Production")?.items.map((item) => item.id),
    ["favorite", "plain"],
  );

  const filtered = buildConnectionGroupSections(
    [ungrouped, plainProd, favorite, alpha],
    {
      search: "finance",
      environment: "prod",
      favoriteOnly: true,
    },
  );

  assert.deepEqual(filtered.map((section) => section.items.map((item) => item.id)), [["favorite"]]);
});
