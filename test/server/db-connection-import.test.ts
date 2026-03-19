import test from "node:test";
import assert from "node:assert/strict";
import { parseDbConnectionImports } from "../../server/lib/extensions/db-management/connection-import-service";

test("connection import parser extracts multiple Spring datasources from yaml", () => {
  const result = parseDbConnectionImports(`
spring:
  datasource:
    primary:
      url: jdbc:mysql://127.0.0.1:3306/app_main?useSSL=false
      username: app_user
      password: secret-a
    reporting:
      jdbc-url: jdbc:mysql://192.168.0.8:3307/app_report
      username: report_user
      password: secret-b
`, "application.yml");

  assert.equal(result.drafts.length, 2);
  assert.deepEqual(
    result.drafts.map((draft) => ({
      name: draft.name,
      host: draft.host,
      port: draft.port,
      username: draft.username,
      databaseName: draft.databaseName,
      sourceType: draft.sourceType,
      missingFields: draft.missingFields,
    })),
    [
      {
        name: "primary",
        host: "127.0.0.1",
        port: 3306,
        username: "app_user",
        databaseName: "app_main",
        sourceType: "spring-config",
        missingFields: [],
      },
      {
        name: "reporting",
        host: "192.168.0.8",
        port: 3307,
        username: "report_user",
        databaseName: "app_report",
        sourceType: "spring-config",
        missingFields: [],
      },
    ],
  );
});

test("connection import parser falls back to raw jdbc urls and marks missing credentials", () => {
  const result = parseDbConnectionImports(`
<data-source url="jdbc:mysql://db.internal:3306/analytics?useSSL=true" />
备用连接 jdbc:mysql://db.internal:3307/archive
`);

  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[0]?.host, "db.internal");
  assert.equal(result.drafts[0]?.databaseName, "analytics");
  assert.deepEqual(result.drafts[0]?.missingFields, ["username", "password"]);
  assert.equal(result.drafts[1]?.port, 3307);
});
