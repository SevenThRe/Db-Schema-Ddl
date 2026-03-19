import type {
  DbConnectionImportDraft,
  DbConnectionImportMissingField,
  DbConnectionImportResponse,
} from "@shared/schema";

type JdbcParseResult = {
  host: string;
  port: number;
  databaseName?: string;
  sslMode: DbConnectionImportDraft["sslMode"];
};

type DraftSeed = {
  name?: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  databaseName?: string;
  sslMode?: DbConnectionImportDraft["sslMode"];
  sourceType: DbConnectionImportDraft["sourceType"];
  sourceLabel: string;
};

function sanitizeNameSegment(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[\\/:*?"<>|]/g, "-");
}

function deriveDraftName(seed: DraftSeed): string {
  const explicit = sanitizeNameSegment(seed.name);
  if (explicit) {
    return explicit;
  }

  const parts = [
    sanitizeNameSegment(seed.databaseName),
    sanitizeNameSegment(seed.host),
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join("@").slice(0, 120);
  }

  return "imported-mysql";
}

function parseSslMode(jdbcUrl: URL): DbConnectionImportDraft["sslMode"] {
  const explicitSslMode = jdbcUrl.searchParams.get("sslMode")?.trim().toUpperCase();
  if (explicitSslMode === "DISABLED") {
    return "disable";
  }
  if (explicitSslMode === "REQUIRED" || explicitSslMode === "VERIFY_CA" || explicitSslMode === "VERIFY_IDENTITY") {
    return "required";
  }

  const useSsl = jdbcUrl.searchParams.get("useSSL")?.trim().toLowerCase();
  if (useSsl === "false") {
    return "disable";
  }
  if (useSsl === "true") {
    return "required";
  }

  return "preferred";
}

function parseJdbcUrl(rawValue: string): JdbcParseResult | null {
  const trimmed = rawValue.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed.toLowerCase().startsWith("jdbc:mysql://")) {
    return null;
  }

  try {
    const jdbcUrl = new URL(trimmed.replace(/^jdbc:/i, ""));
    const databaseName = jdbcUrl.pathname.replace(/^\/+/, "").trim() || undefined;
    return {
      host: jdbcUrl.hostname,
      port: jdbcUrl.port ? Number(jdbcUrl.port) : 3306,
      databaseName,
      sslMode: parseSslMode(jdbcUrl),
    };
  } catch {
    return null;
  }
}

function appendFinding(findings: string[], message: string): void {
  if (!findings.includes(message)) {
    findings.push(message);
  }
}

function normalizeDraft(seed: DraftSeed): DbConnectionImportDraft {
  const username = seed.username?.trim() ?? "";
  const password = seed.password?.trim() || undefined;
  const missingFields: DbConnectionImportMissingField[] = [];

  if (!username) {
    missingFields.push("username");
  }
  if (!password) {
    missingFields.push("password");
  }

  return {
    name: deriveDraftName(seed),
    host: seed.host.trim(),
    port: seed.port && Number.isFinite(seed.port) ? seed.port : 3306,
    username,
    password,
    databaseName: seed.databaseName?.trim() || undefined,
    sslMode: seed.sslMode ?? "preferred",
    sourceType: seed.sourceType,
    sourceLabel: seed.sourceLabel,
    missingFields,
  };
}

function dedupeDrafts(drafts: DbConnectionImportDraft[]): DbConnectionImportDraft[] {
  const byTarget = new Map<string, DbConnectionImportDraft>();
  for (const draft of drafts) {
    const key = [
      draft.host.toLowerCase(),
      String(draft.port),
      draft.databaseName?.toLowerCase() ?? "",
    ].join("|");
    const existing = byTarget.get(key);
    if (!existing) {
      byTarget.set(key, draft);
      continue;
    }

    const existingScore = existing.missingFields.length;
    const draftScore = draft.missingFields.length;
    const shouldReplace =
      draftScore < existingScore ||
      (draftScore === existingScore && draft.username.length > existing.username.length) ||
      (draftScore === existingScore && Boolean(draft.password) && !existing.password);

    if (shouldReplace) {
      byTarget.set(key, draft);
    }
  }

  return Array.from(byTarget.values());
}

function flattenStructuredConfig(content: string): Map<string, string> {
  const flat = new Map<string, string>();
  const stack: Array<{ indent: number; key: string }> = [];

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const commentless = rawLine.replace(/\s+#.*$/, "");
    if (!commentless.trim() || commentless.trimStart().startsWith("#")) {
      continue;
    }

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const propertyMatch = commentless.match(/^\s*([^:=\s][^:=]*?)\s*[:=]\s*(.*?)\s*$/);
    if (!propertyMatch) {
      continue;
    }

    const key = propertyMatch[1].trim().replace(/^['"]|['"]$/g, "");
    const value = propertyMatch[2].trim().replace(/^['"]|['"]$/g, "");

    if (value === "" && commentless.includes(":")) {
      stack.push({ indent, key });
      continue;
    }

    const fullKey = [...stack.map((entry) => entry.key), key].join(".");
    flat.set(fullKey, value);
  }

  return flat;
}

function extractDraftsFromStructuredConfig(
  content: string,
  sourceFileName: string | undefined,
  findings: string[],
): DbConnectionImportDraft[] {
  const flat = flattenStructuredConfig(content);
  const drafts: DbConnectionImportDraft[] = [];

  const groupedKeys = Array.from(flat.entries()).filter(([, value]) => value.toLowerCase().startsWith("jdbc:mysql://"));
  for (const [fullKey, jdbcValue] of groupedKeys) {
    if (!fullKey.endsWith(".url") && !fullKey.endsWith(".jdbc-url")) {
      continue;
    }

    const parsed = parseJdbcUrl(jdbcValue);
    if (!parsed) {
      continue;
    }

    const prefix = fullKey.replace(/(\.jdbc-url|\.url)$/i, "");
    const prefixParts = prefix.split(".");
    const suffix = prefixParts.at(-1);
    const sourceLabel = sourceFileName
      ? `${sourceFileName}:${fullKey}`
      : `config:${fullKey}`;

    drafts.push(
      normalizeDraft({
        name: flat.get(`${prefix}.name`) || (suffix && !["spring", "datasource"].includes(suffix) ? suffix : undefined),
        host: parsed.host,
        port: parsed.port,
        username: flat.get(`${prefix}.username`) || flat.get(`${prefix}.user`),
        password: flat.get(`${prefix}.password`) || flat.get(`${prefix}.pass`),
        databaseName: parsed.databaseName,
        sslMode: parsed.sslMode,
        sourceType: fullKey.startsWith("spring.") ? "spring-config" : "generic-config",
        sourceLabel,
      }),
    );
  }

  if (drafts.length === 0 && flat.size > 0) {
    appendFinding(findings, "识别到了配置键值，但没有发现可解析的 jdbc:mysql:// URL。");
  }

  return drafts;
}

function extractDraftsFromJdbcUrls(
  content: string,
  sourceFileName: string | undefined,
): DbConnectionImportDraft[] {
  const drafts: DbConnectionImportDraft[] = [];
  const jdbcMatches = content.match(/jdbc:mysql:\/\/[^\s"'`<>()]+/gi) ?? [];

  jdbcMatches.forEach((jdbcValue, index) => {
    const parsed = parseJdbcUrl(jdbcValue);
    if (!parsed) {
      return;
    }

    drafts.push(
      normalizeDraft({
        host: parsed.host,
        port: parsed.port,
        databaseName: parsed.databaseName,
        sslMode: parsed.sslMode,
        sourceType: "jdbc-url",
        sourceLabel: sourceFileName
          ? `${sourceFileName}:jdbc#${index + 1}`
          : `jdbc#${index + 1}`,
      }),
    );
  });

  return drafts;
}

export function parseDbConnectionImports(
  content: string,
  fileName?: string,
): DbConnectionImportResponse {
  const findings: string[] = [];
  const structuredDrafts = extractDraftsFromStructuredConfig(content, fileName, findings);
  const jdbcDrafts = extractDraftsFromJdbcUrls(content, fileName);
  const drafts = dedupeDrafts([...structuredDrafts, ...jdbcDrafts]);

  if (drafts.length === 0) {
    appendFinding(findings, "没有识别到可导入的 MySQL 数据源。支持 JDBC URL、Spring application.yml 和 .properties。");
  }

  return {
    drafts,
    findings,
  };
}
