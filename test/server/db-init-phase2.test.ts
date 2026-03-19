import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db init and migrations include runtime tables needed by DB management history/apply flows", async () => {
  const initSource = await read("server/init-db.ts");
  const initSqlSource = await read("server/constants/db-init.ts");
  const migrationsSource = await read("server/constants/db-migrations.ts");

  assert.match(initSqlSource, /createDbSchemaScanEventsTable/);
  assert.match(initSqlSource, /createDbDeployJobsTable/);
  assert.match(initSqlSource, /createDbDeployJobStatementResultsTable/);
  assert.match(initSqlSource, /createDbComparePoliciesTable/);

  assert.match(initSource, /createDbSchemaScanEventsTable/);
  assert.match(initSource, /createDbDeployJobsTable/);
  assert.match(initSource, /createDbDeployJobStatementResultsTable/);
  assert.match(initSource, /createDbComparePoliciesTable/);

  assert.match(migrationsSource, /version:\s*10/);
  assert.match(migrationsSource, /create_db_management_runtime_tables/);
});
