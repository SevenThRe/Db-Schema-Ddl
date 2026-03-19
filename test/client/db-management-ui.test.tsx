import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db management workspace presents MySQL connection, database switch, and introspection controls", async () => {
  const source = await read("client/src/components/db-management/DbManagementWorkspace.tsx");

  assert.match(source, /DB Control Center/);
  assert.match(source, /选择或创建一个连接/);
  assert.match(source, /切换 database/);
  assert.match(source, /建立后续差异与历史的基础/);
  assert.match(source, /<ConnectionManager/);
  assert.match(source, /<DatabaseSelector/);
  assert.match(source, /<SchemaIntrospectionPanel/);
  assert.match(source, /<DbDiffWorkspace/);
});

test("database selector supports manual database entry for restricted remote accounts", async () => {
  const source = await read("client/src/components/db-management/DatabaseSelector.tsx");

  assert.match(source, /手动输入 database/);
  assert.match(source, /使用手动输入/);
  assert.match(source, /远程受限账号/);
});

test("connection manager supports importing multiple datasource configs into reusable drafts", async () => {
  const source = await read("client/src/components/db-management/ConnectionManager.tsx");

  assert.match(source, /导入配置/);
  assert.match(source, /支持 JDBC URL、Spring `application\.yml` \/ `\.properties`/);
  assert.match(source, /批量保存可用连接/);
  assert.match(source, /填入表单/);
  assert.match(source, /支持直接填写 `host:port`/);
});

test("dashboard renders the dedicated db management workspace when the extension is enabled", async () => {
  const source = await read("client/src/pages/Dashboard.tsx");

  assert.match(source, /<DbManagementWorkspace/);
  assert.match(source, /activeModule === "db-management"/);
  assert.match(source, /selectedFileId=\{selectedFileId\}/);
  assert.match(source, /selectedSheet=\{selectedSheet\}/);
});

test("db diff workspace exposes three-column compare, rename review, and SQL preview flow", async () => {
  const source = await read("client/src/components/db-management/DbDiffWorkspace.tsx");

  assert.match(source, /File vs Live DB Diff/);
  assert.match(source, /对象树/);
  assert.match(source, /差异详情/);
  assert.match(source, /SQL Preview \/ Dry Run/);
  assert.match(source, /Rename 集中确认/);
  assert.match(source, /生成 SQL Preview/);
});
