import test from "node:test";
import assert from "node:assert/strict";
import {
  hasDbConnectionIdentityChanged,
  isDatabaseEnumerationUnavailable,
  normalizeDbConnectionEndpoint,
  normalizeDbConnectionError,
} from "../../server/lib/extensions/db-management/connection-service-helpers";

test("connection service resets remembered database when host, port, or username changes", () => {
  assert.equal(
    hasDbConnectionIdentityChanged(
      { host: "127.0.0.1", port: 3306, username: "root" },
      { host: "127.0.0.1", port: 3306, username: "root", name: "local", sslMode: "preferred", rememberPassword: true },
    ),
    false,
  );

  assert.equal(
    hasDbConnectionIdentityChanged(
      { host: "127.0.0.1", port: 3306, username: "root" },
      { host: "192.168.0.10", port: 3306, username: "root", name: "local", sslMode: "preferred", rememberPassword: true },
    ),
    true,
  );
});

test("connection service normalizes stale database and credential errors into user-facing messages", () => {
  assert.equal(
    normalizeDbConnectionError({ code: "ER_BAD_DB_ERROR", message: "Unknown database 'legacy_db'" }, "legacy_db").message,
    "数据库 legacy_db 在当前连接中不存在，请重新选择 database。",
  );
  assert.equal(
    normalizeDbConnectionError({ code: "ER_ACCESS_DENIED_ERROR", message: "Access denied" }).message,
    "数据库用户名或密码不正确，请检查连接凭据后重试。",
  );
  assert.equal(
    normalizeDbConnectionError(new Error("No saved password is available for this connection.")).message,
    "该连接没有已保存密码。请重新输入密码并保存后再读取 database。",
  );
});

test("connection service detects when database enumeration is unavailable for restricted users", () => {
  assert.equal(
    isDatabaseEnumerationUnavailable({
      code: "ER_DBACCESS_DENIED_ERROR",
      message: "Access denied for user to database 'information_schema'",
    }),
    true,
  );
  assert.equal(
    isDatabaseEnumerationUnavailable({
      code: "ER_TABLEACCESS_DENIED_ERROR",
      message: "SELECT command denied to user for table 'SCHEMATA' in schema 'information_schema'",
    }),
    true,
  );
  assert.equal(
    isDatabaseEnumerationUnavailable({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED",
    }),
    false,
  );
});

test("connection service accepts host:port in the host field for remote databases", () => {
  assert.deepEqual(
    normalizeDbConnectionEndpoint({
      host: "192.168.3.227:3306",
      port: 3306,
    }),
    {
      host: "192.168.3.227",
      port: 3306,
    },
  );

  assert.deepEqual(
    normalizeDbConnectionEndpoint({
      host: "db.internal:3307",
      port: 3306,
    }),
    {
      host: "db.internal",
      port: 3307,
    },
  );
});
