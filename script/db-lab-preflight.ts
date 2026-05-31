import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const DB_LAB_MYSQL_CONNECTION =
  "mysql://dbtools_writable:dbtools_writable@127.0.0.1:3306/dbtools_lab";
export const DB_LAB_POSTGRES_CONNECTION =
  "postgres://dbtools_writable:dbtools_writable@127.0.0.1:5432/dbtools_lab?schema=app";
export const DB_LAB_DEFAULT_MYSQL_PORT = 3306;
export const DB_LAB_DEFAULT_POSTGRES_PORT = 5432;

type CheckStatus = "passed" | "failed" | "warning";

export interface DbLabCheck {
  id: string;
  status: CheckStatus;
  message: string;
  detail?: string;
}

export interface DbLabPreflightResult {
  ok: boolean;
  checks: DbLabCheck[];
  commands: {
    up: string;
    down: string;
    mysqlPrereq: string;
    mysqlLive: string;
    postgresPrereq: string;
    postgresLive: string;
  };
}

export interface DbLabPortConfig {
  mysqlPort: number;
  postgresPort: number;
  portChecks: DbLabCheck[];
}

export interface DbLabConnectionConfig extends DbLabPortConfig {
  mysqlConnection: string;
  postgresConnection: string;
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function commandExists(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore", shell: false });
  return result.status === 0;
}

function dockerComposeAvailable(): boolean {
  if (!commandExists("docker", ["--version"])) {
    return false;
  }
  const result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

function resolvePort(
  env: NodeJS.ProcessEnv,
  name: "DBTOOLS_MYSQL_PORT" | "DBTOOLS_POSTGRES_PORT",
  defaultPort: number,
): { port: number; check: DbLabCheck } {
  const raw = env[name]?.trim();
  if (!raw) {
    return {
      port: defaultPort,
      check: {
        id: `env:${name}`,
        status: "passed",
        message: `${name} is optional for DB lab startup.`,
        detail: `${name} is unset; using default port ${defaultPort}.`,
      },
    };
  }

  const port = Number(raw);
  const isValid = Number.isInteger(port) && port >= 1 && port <= 65535;
  return {
    port: isValid ? port : defaultPort,
    check: {
      id: `env:${name}`,
      status: isValid ? "passed" : "failed",
      message: `${name} must be a TCP port between 1 and 65535 when set.`,
      detail: isValid
        ? `${name}=${port}`
        : `${name}=${raw} is invalid; default port ${defaultPort} will only be used for advisory output.`,
    },
  };
}

export function resolveDbLabConnections(
  env: NodeJS.ProcessEnv = process.env,
): DbLabConnectionConfig {
  const mysql = resolvePort(env, "DBTOOLS_MYSQL_PORT", DB_LAB_DEFAULT_MYSQL_PORT);
  const postgres = resolvePort(
    env,
    "DBTOOLS_POSTGRES_PORT",
    DB_LAB_DEFAULT_POSTGRES_PORT,
  );

  return {
    mysqlPort: mysql.port,
    postgresPort: postgres.port,
    portChecks: [mysql.check, postgres.check],
    mysqlConnection:
      `mysql://dbtools_writable:dbtools_writable@127.0.0.1:${mysql.port}/dbtools_lab`,
    postgresConnection:
      `postgres://dbtools_writable:dbtools_writable@127.0.0.1:${postgres.port}/dbtools_lab?schema=app`,
  };
}

async function canConnect(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function repoFileCheck(cwd: string, relativePath: string): DbLabCheck {
  const absolutePath = path.join(cwd, relativePath);
  return {
    id: `file:${relativePath}`,
    status: fs.existsSync(absolutePath) ? "passed" : "failed",
    message: `${relativePath} must exist for deterministic DB lab startup.`,
  };
}

export async function runDbLabPreflight(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<DbLabPreflightResult> {
  const checks: DbLabCheck[] = [];
  const labConfig = resolveDbLabConnections(env);

  const hasDockerCompose = dockerComposeAvailable();
  checks.push({
    id: "container-compose-runtime",
    status: hasDockerCompose ? "passed" : "failed",
    message: "Docker Compose is required to start the local DB verification lab with the npm scripts in this repository.",
    detail: hasDockerCompose
      ? "docker compose is available"
      : "No docker compose command was found.",
  });

  checks.push(repoFileCheck(cwd, "docker-compose.db-lab.yml"));
  checks.push(repoFileCheck(cwd, path.join("test", "db-lab", "mysql", "001-dbtools-lab.sql")));
  checks.push(repoFileCheck(cwd, path.join("test", "db-lab", "postgres", "001-dbtools-lab.sql")));
  checks.push(...labConfig.portChecks);

  const mysqlOpen = await canConnect("127.0.0.1", labConfig.mysqlPort);
  checks.push({
    id: "mysql-port",
    status: mysqlOpen ? "passed" : "warning",
    message:
      `MySQL lab endpoint should listen on 127.0.0.1:${labConfig.mysqlPort} after db-lab startup.`,
    detail: mysqlOpen
      ? `127.0.0.1:${labConfig.mysqlPort} is reachable`
      : `127.0.0.1:${labConfig.mysqlPort} is not reachable yet.`,
  });

  const postgresOpen = await canConnect("127.0.0.1", labConfig.postgresPort);
  checks.push({
    id: "postgres-port",
    status: postgresOpen ? "passed" : "warning",
    message:
      `PostgreSQL lab endpoint should listen on 127.0.0.1:${labConfig.postgresPort} after db-lab startup.`,
    detail: postgresOpen
      ? `127.0.0.1:${labConfig.postgresPort} is reachable`
      : `127.0.0.1:${labConfig.postgresPort} is not reachable yet.`,
  });

  const hardFailures = checks.filter((check) => check.status === "failed");

  return {
    ok: hardFailures.length === 0 && mysqlOpen && postgresOpen,
    checks,
    commands: {
      up: "npm run db-lab:up",
      down: "npm run db-lab:down",
      mysqlPrereq:
        `npm run verify:desktop:live:prereq -- --driver=mysql --connection-string="${labConfig.mysqlConnection}"`,
      mysqlLive:
        `npm run verify:desktop:live -- --driver=mysql --connection-string="${labConfig.mysqlConnection}"`,
      postgresPrereq:
        `npm run verify:desktop:live:prereq -- --driver=postgres --default-schema=app --connection-string="${labConfig.postgresConnection}"`,
      postgresLive:
        `npm run verify:desktop:live -- --driver=postgres --default-schema=app --connection-string="${labConfig.postgresConnection}"`,
    },
  };
}

function printResult(result: DbLabPreflightResult) {
  console.log("DB lab preflight");
  for (const check of result.checks) {
    const marker = check.status === "passed" ? "PASS" : check.status === "warning" ? "WARN" : "FAIL";
    console.log(`- ${marker} ${check.id}: ${check.detail ?? check.message}`);
  }

  if (result.ok) {
    console.log("\nDB lab appears reachable. Next commands:");
  } else {
    console.log("\nDB lab is not fully reachable. Bootstrap commands:");
  }

  console.log(`- ${result.commands.up}`);
  console.log(`- ${result.commands.mysqlPrereq}`);
  console.log(`- ${result.commands.postgresPrereq}`);
  console.log(`- ${result.commands.mysqlLive}`);
  console.log(`- ${result.commands.postgresLive}`);
}

const entryArg = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryArg) {
  const result = await runDbLabPreflight();
  printResult(result);
  if (!result.ok && !hasArg("advisory")) {
    process.exit(1);
  }
}
