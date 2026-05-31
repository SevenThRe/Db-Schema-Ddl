import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DB_LAB_MYSQL_CONNECTION,
  DB_LAB_POSTGRES_CONNECTION,
  resolveDbLabConnections,
  runDbLabPreflight,
} from "../../script/db-lab-preflight";

test("db lab connection constants target deterministic local verification databases", () => {
  assert.equal(
    DB_LAB_MYSQL_CONNECTION,
    "mysql://dbtools_writable:dbtools_writable@127.0.0.1:3306/dbtools_lab",
  );
  assert.equal(
    DB_LAB_POSTGRES_CONNECTION,
    "postgres://dbtools_writable:dbtools_writable@127.0.0.1:5432/dbtools_lab?schema=app",
  );
});

test("db lab preflight fails closed when lab files are absent", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbtools-db-lab-missing-"));
  const result = await runDbLabPreflight(tempDir);

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((check) => check.id === "file:docker-compose.db-lab.yml")?.status,
    "failed",
  );
  assert.match(result.commands.up, /db-lab:up/);
  assert.match(result.commands.mysqlPrereq, /verify:desktop:live:prereq/);
  assert.match(result.commands.postgresLive, /--default-schema=app/);
});

test("db lab preflight uses the same custom ports as docker compose", async () => {
  const connections = resolveDbLabConnections({
    DBTOOLS_MYSQL_PORT: "13306",
    DBTOOLS_POSTGRES_PORT: "15432",
  });

  assert.equal(connections.mysqlPort, 13306);
  assert.equal(connections.postgresPort, 15432);
  assert.equal(
    connections.mysqlConnection,
    "mysql://dbtools_writable:dbtools_writable@127.0.0.1:13306/dbtools_lab",
  );
  assert.equal(
    connections.postgresConnection,
    "postgres://dbtools_writable:dbtools_writable@127.0.0.1:15432/dbtools_lab?schema=app",
  );

  const result = await runDbLabPreflight(process.cwd(), {
    DBTOOLS_MYSQL_PORT: "13306",
    DBTOOLS_POSTGRES_PORT: "15432",
  });

  assert.match(result.commands.mysqlPrereq, /127\.0\.0\.1:13306/);
  assert.match(result.commands.postgresLive, /127\.0\.0\.1:15432/);
  assert.equal(
    result.checks.find((check) => check.id === "env:DBTOOLS_MYSQL_PORT")?.status,
    "passed",
  );
});

test("db lab preflight fails closed for invalid custom ports", async () => {
  const result = await runDbLabPreflight(process.cwd(), {
    DBTOOLS_MYSQL_PORT: "not-a-port",
    DBTOOLS_POSTGRES_PORT: "70000",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((check) => check.id === "env:DBTOOLS_MYSQL_PORT")?.status,
    "failed",
  );
  assert.equal(
    result.checks.find((check) => check.id === "env:DBTOOLS_POSTGRES_PORT")?.status,
    "failed",
  );
});

test("db lab preflight reports BLOCKED with external-DB guidance when no runtime and no endpoint", async () => {
  const result = await runDbLabPreflight(process.cwd(), {}, {
    hasDockerCompose: () => false,
    canConnect: async () => false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, "blocked");
  // The operator must not be told to run db-lab:up when Docker is absent; the
  // remediation must point at installing Docker or targeting an external DB.
  assert.ok(result.remediation.some((line) => /Docker/.test(line)));
  assert.ok(
    result.remediation.some((line) => /connection-string|DBTOOLS_MYSQL_PORT/.test(line)),
  );
  assert.ok(result.remediation.some((line) => /UNPROVEN/.test(line)));
});

test("db lab preflight reports READY TO BOOTSTRAP when runtime exists but endpoints are down", async () => {
  const result = await runDbLabPreflight(process.cwd(), {}, {
    hasDockerCompose: () => true,
    canConnect: async () => false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, "ready-to-bootstrap");
  assert.ok(result.remediation.some((line) => /db-lab:up/.test(line)));
});

test("db lab preflight reports REACHABLE when runtime and both endpoints answer", async () => {
  const result = await runDbLabPreflight(process.cwd(), {}, {
    hasDockerCompose: () => true,
    canConnect: async () => true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, "reachable");
  assert.ok(result.remediation.some((line) => /endpoints answer/.test(line)));
});

test("db lab preflight treats a live external endpoint without docker as bootstrappable", async () => {
  const result = await runDbLabPreflight(process.cwd(), {}, {
    hasDockerCompose: () => false,
    canConnect: async () => true,
  });

  assert.equal(result.state, "ready-to-bootstrap");
  assert.ok(
    result.remediation.some((line) => /endpoint is already listening/.test(line)),
  );
});

test("db lab package scripts route live verification through lab mode", () => {
  const packageJson = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(packageJson, /"verify:desktop:live:lab:mysql:prereq": "npm run verify:desktop:live:prereq -- --driver=mysql --lab"/);
  assert.match(packageJson, /"verify:desktop:live:lab:mysql": "npm run verify:desktop:live -- --driver=mysql --lab"/);
  assert.match(packageJson, /"verify:desktop:live:lab:postgres:prereq": "npm run verify:desktop:live:prereq -- --driver=postgres --lab"/);
  assert.match(packageJson, /"verify:desktop:live:lab:postgres": "npm run verify:desktop:live -- --driver=postgres --lab"/);
  assert.doesNotMatch(packageJson, /verify:desktop:live:lab:[^"]+"[^"]+127\.0\.0\.1:3306/);
  assert.doesNotMatch(packageJson, /verify:desktop:live:lab:[^"]+"[^"]+127\.0\.0\.1:5432/);
});
