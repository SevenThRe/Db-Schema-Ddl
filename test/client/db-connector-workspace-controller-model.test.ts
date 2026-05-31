import assert from "node:assert/strict";
import test from "node:test";
import type { DbConnectionConfig } from "../../shared/schema";
import {
  buildDuplicateConnectionDraft,
  formatActiveConnectionLabel,
  isCompatibilityToolActive,
  resolveActiveConnection,
  resolveActiveTabValue,
  resolveDbConnectorSidebarMode,
  resolveShellSurface,
} from "../../client/src/components/extensions/db-workbench/db-connector-workspace-controller-model";

function connection(patch: Partial<DbConnectionConfig> = {}): DbConnectionConfig {
  return {
    id: "conn-1",
    name: "Main MySQL",
    driver: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database: "app",
    username: "root",
    password: "secret",
    favorite: true,
    hasStoredPassword: true,
    ...patch,
  };
}

test("workspace controller model resolves active connection and shell context", () => {
  const mysql = connection();
  const postgres = connection({
    id: "pg-1",
    name: "Tenant Postgres",
    driver: "postgres",
    port: 5432,
    database: "tenant",
  });

  assert.equal(resolveDbConnectorSidebarMode("host-view"), "host");
  assert.equal(resolveDbConnectorSidebarMode(undefined), "embedded");
  assert.equal(resolveActiveConnection([mysql, postgres], "pg-1")?.id, "pg-1");
  assert.equal(resolveActiveConnection([mysql], "missing"), null);
  assert.match(
    formatActiveConnectionLabel(postgres),
    /Tenant Postgres · postgres:\/\/127\.0\.0\.1:5432\/tenant/,
  );
  assert.equal(formatActiveConnectionLabel(null), "未选择活动连接");
  assert.equal(resolveActiveTabValue({ editingConfig: mysql, workspaceView: "sql" }), "connections");
  assert.equal(resolveActiveTabValue({ editingConfig: null, workspaceView: "diff" }), "diff");
  assert.equal(isCompatibilityToolActive("schema"), true);
  assert.equal(isCompatibilityToolActive("sql"), false);
  assert.equal(resolveShellSurface({ activeConnection: null, activeTabValue: "sql" }).status, "Primary Support");
  assert.equal(resolveShellSurface({ activeConnection: mysql, activeTabValue: "sql" }).status, "Primary");
});

test("workspace controller model builds safe duplicate connection drafts", () => {
  const draft = buildDuplicateConnectionDraft(connection());

  assert.equal(draft.id, "");
  assert.equal(draft.name, "Main MySQL - 副本");
  assert.equal(draft.password, "");
  assert.equal(draft.hasStoredPassword, false);
  assert.equal(draft.clearStoredPassword, false);
  assert.equal(draft.favorite, false);
  assert.equal(draft.host, "127.0.0.1");
});
