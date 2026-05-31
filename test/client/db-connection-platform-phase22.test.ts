import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection form states P0 support scope and keeps unsupported transports out of product claims", async () => {
  const form = await read(
    "client/src/components/extensions/db-workbench/ConnectionForm.tsx",
  );
  const formSections = await read(
    "client/src/components/extensions/db-workbench/connection-form-sections.tsx",
  );

  assert.match(form, /<ConnectionFormSupportScope/);
  assert.match(form, /<ConnectionStringImportPanel/);
  assert.match(form, /<ConnectionGovernanceFields/);
  assert.match(form, /<ConnectionFormTestResult/);
  assert.match(formSections, /P0 support scope/);
  assert.match(formSections, /Current build supports direct MySQL \/ PostgreSQL connections with saved-password handling/);
  // TLS is now wired, but the copy must still flag it as not-yet-live-verified
  // and must keep SSH / enterprise auth out of product claims.
  assert.match(formSections, /TLS is wired end-to-end and code-level verified, but not yet validated against a live TLS-required server/);
  assert.match(formSections, /SSH tunnelling and enterprise auth are not product-supported in this build/);
  assert.doesNotMatch(formSections, /SSH \/ TLS \/ enterprise auth are not product-supported/);
  assert.match(formSections, /operator controls, not cosmetic metadata/);
});

test("connection center delegates editing to the extracted connection form", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );
  const workspaceTabs = await read(
    "client/src/components/extensions/db-workbench/DbConnectorWorkspaceTabs.tsx",
  );

  assert.match(workspace, /<DbConnectorWorkspaceTabs/);
  assert.match(workspaceTabs, /import \{ ConnectionForm \} from "\.\/ConnectionForm"/);
  assert.match(workspaceTabs, /<ConnectionForm/);
  assert.match(workspaceTabs, /connectionState\.saveConnection\(normalizeConnectionConfig\(config\)\)/);
});

test("connection center delegates discovery filters and grouped list to focused sections", async () => {
  const center = await read(
    "client/src/components/extensions/db-workbench/ConnectionCenterView.tsx",
  );
  const sections = await read(
    "client/src/components/extensions/db-workbench/connection-center-sections.tsx",
  );
  const localDiscovery = await read(
    "client/src/components/extensions/db-workbench/connection-center-local-discovery.tsx",
  );
  const filterBar = await read(
    "client/src/components/extensions/db-workbench/connection-center-filter-bar.tsx",
  );
  const groupList = await read(
    "client/src/components/extensions/db-workbench/connection-center-group-list.tsx",
  );

  assert.match(center, /<ConnectionCenterHeader/);
  assert.match(center, /<LocalDiscoveryPanel/);
  assert.match(center, /<ConnectionCenterFilterBar/);
  assert.match(center, /<ConnectionGroupList/);
  assert.doesNotMatch(center, /发现的本地数据库/);
  assert.doesNotMatch(center, /搜索名称、主机、数据库、分组或备注/);
  assert.doesNotMatch(center, /暂无连接，先添加一个数据库连接来启动工作台/);
  assert.match(sections, /connection-center-local-discovery/);
  assert.match(sections, /connection-center-filter-bar/);
  assert.match(sections, /connection-center-group-list/);
  assert.match(localDiscovery, /发现的本地数据库/);
  assert.match(filterBar, /搜索名称、主机、数据库、分组或备注/);
  assert.match(groupList, /暂无连接，先添加一个数据库连接来启动工作台/);
});

test("connection center copy explains current supported scope and safety semantics", async () => {
  const header = await read(
    "client/src/components/extensions/db-workbench/connection-center-header.tsx",
  );
  const form = await read(
    "client/src/components/extensions/db-workbench/connection-form-sections.tsx",
  );

  assert.match(header, /当前构建承诺 direct MySQL \/ PostgreSQL 连接与安全保存密码/);
  assert.match(header, /已接入 TLS\/SSL 传输加密（代码级，尚未对真实 TLS 服务器实测）/);
  assert.match(header, /SSH 隧道 \/ 企业认证仍未作为产品能力承诺/);
  assert.match(form, /启用后，工作台会在运行时阻止 DML \/ DDL \/ Data Sync apply/);
});

test("db workbench design doc records direct-driver scope without overclaiming secure connectivity", async () => {
  const design = await read("docs/db-workbench-extension-design.md");

  assert.match(design, /当前承诺 direct `MySQL \/ PostgreSQL` 连接/);
  // TLS is wired + code-level verified but not live-verified; SSH/enterprise auth stay unclaimed.
  assert.match(design, /尚未对真实 TLS 服务器实测/);
  assert.match(design, /不能把 `SSH 隧道 \/ 企业认证` 写成已交付产品能力/);
});
