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

/**
 * Classifies the overall preflight outcome so error reporting can give the
 * operator the correct next step instead of always suggesting `db-lab:up`:
 * - `reachable`: both lab endpoints answer; live verification can run now.
 * - `ready-to-bootstrap`: the lab can be started (or an external endpoint is
 *   already listening) — a concrete bootstrap path exists on this machine.
 * - `blocked`: no container runtime AND no reachable DB endpoint, so neither
 *   the bundled lab nor an external DB can be verified here.
 */
export type DbLabPreflightState = "reachable" | "ready-to-bootstrap" | "blocked";

export interface DbLabPreflightProbes {
  hasDockerCompose?: () => boolean;
  canConnect?: (host: string, port: number) => Promise<boolean>;
}

export interface DbLabPreflightResult {
  ok: boolean;
  state: DbLabPreflightState;
  remediation: string[];
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

function classifyPreflight(input: {
  ok: boolean;
  hasDockerCompose: boolean;
  anyEndpointReachable: boolean;
  hardFailures: DbLabCheck[];
}): { state: DbLabPreflightState; remediation: string[] } {
  const remediation: string[] = [];

  // Hard failures that are not the container runtime itself (e.g. a missing lab
  // file or an invalid custom port) must always be surfaced as concrete fixes.
  const otherFailures = input.hardFailures.filter(
    (failure) => failure.id !== "container-compose-runtime",
  );
  const appendOtherFailures = () => {
    for (const failure of otherFailures) {
      remediation.push(`Resolve ${failure.id}: ${failure.detail ?? failure.message}`);
    }
  };

  if (input.ok) {
    remediation.push(
      "Both lab endpoints answer. Run the prereq commands, then the live verification commands below.",
    );
    return { state: "reachable", remediation };
  }

  if (!input.hasDockerCompose && !input.anyEndpointReachable) {
    remediation.push(
      "Docker Compose was not found, so `npm run db-lab:up` cannot start the bundled lab on this machine.",
      "Either install Docker Desktop (or the docker compose plugin) to use the bundled lab,",
      "or point verification at an already-running database instead of the bundled lab:",
      "  - set DBTOOLS_MYSQL_PORT / DBTOOLS_POSTGRES_PORT to an existing local instance, or",
      "  - pass --connection-string=... directly to verify:desktop:live(:prereq).",
      "Until a real endpoint answers, only code-level verification is possible; live DB verification stays UNPROVEN.",
    );
    appendOtherFailures();
    return { state: "blocked", remediation };
  }

  if (!input.hasDockerCompose && input.anyEndpointReachable) {
    remediation.push(
      "Docker Compose is unavailable, but a database endpoint is already listening.",
      "Run verification directly against it using the prereq/live commands below (adjust the connection string if it is not the bundled lab).",
    );
  } else {
    remediation.push(
      "Container runtime is available but the lab is not fully reachable yet.",
      "Start the lab with `npm run db-lab:up`, wait for the containers to become healthy, then re-run this preflight.",
    );
  }
  appendOtherFailures();
  return { state: "ready-to-bootstrap", remediation };
}

export async function runDbLabPreflight(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  probes: DbLabPreflightProbes = {},
): Promise<DbLabPreflightResult> {
  const checks: DbLabCheck[] = [];
  const labConfig = resolveDbLabConnections(env);
  const detectDockerCompose = probes.hasDockerCompose ?? dockerComposeAvailable;
  const probeConnect = probes.canConnect ?? canConnect;

  const hasDockerCompose = detectDockerCompose();
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

  const mysqlOpen = await probeConnect("127.0.0.1", labConfig.mysqlPort);
  checks.push({
    id: "mysql-port",
    status: mysqlOpen ? "passed" : "warning",
    message:
      `MySQL lab endpoint should listen on 127.0.0.1:${labConfig.mysqlPort} after db-lab startup.`,
    detail: mysqlOpen
      ? `127.0.0.1:${labConfig.mysqlPort} is reachable`
      : `127.0.0.1:${labConfig.mysqlPort} is not reachable yet.`,
  });

  const postgresOpen = await probeConnect("127.0.0.1", labConfig.postgresPort);
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
  const ok = hardFailures.length === 0 && mysqlOpen && postgresOpen;
  const anyEndpointReachable = mysqlOpen || postgresOpen;

  const { state, remediation } = classifyPreflight({
    ok,
    hasDockerCompose,
    anyEndpointReachable,
    hardFailures,
  });

  return {
    ok,
    state,
    remediation,
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

  const stateLabel =
    result.state === "reachable"
      ? "REACHABLE - lab endpoints answer"
      : result.state === "ready-to-bootstrap"
        ? "READY TO BOOTSTRAP - a concrete next step exists on this machine"
        : "BLOCKED - no container runtime and no reachable DB endpoint";
  console.log(`\nState: ${stateLabel}`);

  console.log("\nRemediation:");
  for (const line of result.remediation) {
    console.log(`- ${line}`);
  }

  console.log("\nCommands:");
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
