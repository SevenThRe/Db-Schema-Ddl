import { type TableInfo, type ColumnInfo, type GenerateDdlRequest, type DdlSettings } from '@shared/schema';
import { normalizeDataTypeAndSize, validateGenerateDdlRequest } from './ddl-validation';

const DEFAULT_SETTINGS: DdlSettings = {
  mysqlEngine: "InnoDB",
  mysqlCharset: "utf8mb4",
  mysqlCollate: "utf8mb4_bin",
  varcharCharset: "utf8mb4",
  varcharCollate: "utf8mb4_bin",
  exportFilenamePrefix: "Crt_",
  exportFilenameSuffix: "",
  includeCommentHeader: true,
  authorName: "ISI",
  includeSetNames: true,
  includeDropTable: true,
  downloadPath: undefined,
  excelReadPath: undefined,
  customHeaderTemplate: undefined,
  useCustomHeader: false,
  mysqlDataTypeCase: "lower",
  mysqlBooleanMode: "tinyint(1)",
  pkMarkers: ["\u3007"],
  maxConsecutiveEmptyRows: 10,
  uploadRateLimitWindowMs: 60000,
  uploadRateLimitMaxRequests: 20,
  parseRateLimitWindowMs: 60000,
  parseRateLimitMaxRequests: 40,
  globalProtectRateLimitWindowMs: 60000,
  globalProtectRateLimitMaxRequests: 240,
  globalProtectMaxInFlight: 80,
  prewarmEnabled: true,
  prewarmMaxConcurrency: 1,
  prewarmQueueMax: 12,
  prewarmMaxFileMb: 20,
  taskManagerMaxQueueLength: 200,
  taskManagerStalePendingMs: 1800000,
  nameFixDefaultMode: "copy",
  nameFixConflictStrategy: "suffix_increment",
  nameFixReservedWordStrategy: "prefix",
  nameFixLengthOverflowStrategy: "truncate_hash",
  nameFixMaxIdentifierLength: 64,
  nameFixBackupRetentionDays: 30,
  nameFixMaxBatchConcurrency: 4,
  allowOverwriteInElectron: true,
  allowExternalPathWrite: false,
};

const MYSQL_AUTO_INCREMENT_DATA_TYPES = new Set([
  "tinyint",
  "smallint",
  "int",
  "integer",
  "bigint",
]);

type AutoIncrementIgnoreReason = "not_primary_key" | "non_numeric_type";

export interface DdlGenerationWarning {
  code: "AUTO_INCREMENT_IGNORED" | "AUTO_INCREMENT_DIALECT_UNSUPPORTED";
  tableName: string;
  columnName: string;
  message: string;
  reason?: AutoIncrementIgnoreReason | "dialect_unsupported";
}

function resolveMySqlAutoIncrementEligibility(column: ColumnInfo): {
  eligible: boolean;
  reason?: AutoIncrementIgnoreReason;
} {
  if (!column.autoIncrement) {
    return { eligible: false };
  }
  if (!column.isPk) {
    return { eligible: false, reason: "not_primary_key" };
  }

  const normalizedType = normalizeDataTypeAndSize(column.dataType, column.size).type?.toLowerCase();
  if (!normalizedType || !MYSQL_AUTO_INCREMENT_DATA_TYPES.has(normalizedType)) {
    return { eligible: false, reason: "non_numeric_type" };
  }

  return { eligible: true };
}

function substituteTemplateVariables(template: string, table: TableInfo, authorName: string | undefined): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  return template
    .replace(/\$\{logical_name\}/g, table.logicalTableName)
    .replace(/\$\{physical_name\}/g, table.physicalTableName)
    .replace(/\$\{author\}/g, authorName || 'ISI')
    .replace(/\$\{date\}/g, dateStr);
}

// Export function for use in routes (for filename suffix substitution)
export function substituteFilenameSuffix(suffix: string, table: TableInfo, authorName: string): string {
  if (!suffix) return '';
  return substituteTemplateVariables(suffix, table, authorName);
}

export function generateDDL(request: GenerateDdlRequest): string {
  const chunks: string[] = [];
  let isFirst = true;
  renderDDLChunks(request, (chunk) => {
    if (!isFirst) {
      chunks.push('\n\n');
    }
    chunks.push(chunk);
    isFirst = false;
  });
  return chunks.join('');
}

export function collectDdlGenerationWarnings(request: GenerateDdlRequest): DdlGenerationWarning[] {
  const warnings: DdlGenerationWarning[] = [];
  const { tables, dialect } = request;

  tables.forEach((table) => {
    table.columns.forEach((column) => {
      if (!column.autoIncrement) {
        return;
      }

      const tableName = table.physicalTableName || table.logicalTableName || "(unknown_table)";
      const columnName = column.physicalName || column.logicalName || "(unknown_column)";

      if (dialect !== "mysql") {
        warnings.push({
          code: "AUTO_INCREMENT_DIALECT_UNSUPPORTED",
          tableName,
          columnName,
          reason: "dialect_unsupported",
          message: `AUTO_INCREMENT on ${tableName}.${columnName} is ignored for ${dialect.toUpperCase()} dialect.`,
        });
        return;
      }

      const eligibility = resolveMySqlAutoIncrementEligibility(column);
      if (eligibility.eligible) {
        return;
      }

      if (eligibility.reason === "not_primary_key") {
        warnings.push({
          code: "AUTO_INCREMENT_IGNORED",
          tableName,
          columnName,
          reason: "not_primary_key",
          message: `AUTO_INCREMENT on ${tableName}.${columnName} is ignored because the column is not marked as PK.`,
        });
        return;
      }

      warnings.push({
        code: "AUTO_INCREMENT_IGNORED",
        tableName,
        columnName,
        reason: "non_numeric_type",
        message: `AUTO_INCREMENT on ${tableName}.${columnName} is ignored because data type is not integer-based.`,
      });
    });
  });

  return warnings;
}

function renderDDLChunks(
  request: GenerateDdlRequest,
  push: (ddlChunk: string) => void,
): void {
  const { tables, dialect, settings = DEFAULT_SETTINGS } = request;
  validateGenerateDdlRequest({ tables, dialect });

  tables.forEach((table) => {
    if (dialect === 'mysql') {
      push(generateMySQL(table, settings));
    } else {
      push(generateOracle(table, settings));
    }
  });
}

export async function streamDDL(
  request: GenerateDdlRequest,
  writeChunk: (ddlChunk: string) => void | Promise<void>,
): Promise<void> {
  let isFirst = true;
  const { tables, dialect, settings = DEFAULT_SETTINGS } = request;
  validateGenerateDdlRequest({ tables, dialect });
  for (const table of tables) {
    if (!isFirst) {
      await writeChunk('\n\n');
    }
    const ddlChunk = dialect === 'mysql'
      ? generateMySQL(table, settings)
      : generateOracle(table, settings);
    await writeChunk(ddlChunk);
    isFirst = false;
  }
}

function generateMySQL(table: TableInfo, settings: DdlSettings): string {
  const lines: string[] = [];

  // Add comment header (if enabled)
  if (settings.includeCommentHeader) {
    if (settings.useCustomHeader && settings.customHeaderTemplate) {
      // Use custom header template with variable substitution
      const customHeader = substituteTemplateVariables(
        settings.customHeaderTemplate,
        table,
        settings.authorName
      );
      lines.push('/*');
      customHeader.split('\n').forEach(line => {
        lines.push(line ? ` ${line}` : '');
      });
      lines.push('*/');
      lines.push('');
    } else {
      // Use default header format
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      lines.push('/*');
      lines.push(` TableName: ${table.logicalTableName}`);
      lines.push(` Author: ${settings.authorName}`);
      lines.push(` Date: ${today}`);
      lines.push('*/');
      lines.push('');
    }
  }

  // Add SET NAMES (if enabled)
  if (settings.includeSetNames) {
    lines.push(`SET NAMES ${settings.mysqlCharset};`);
    lines.push('');
  }

  // Add DROP TABLE IF EXISTS (if enabled)
  if (settings.includeDropTable) {
    lines.push(`DROP TABLE IF EXISTS \`${table.physicalTableName}\`;`);
  }

  // CREATE TABLE
  lines.push(`CREATE TABLE \`${table.physicalTableName}\`  (`);

  const pkCols: string[] = [];
  const hasPk = table.columns.some(c => c.isPk);

  table.columns.forEach((col, index) => {
    const normalizedTypeSpec = normalizeDataTypeAndSize(col.dataType, col.size);
    let line = `  \`${col.physicalName}\` ${mapDataTypeMySQL(normalizedTypeSpec.type, normalizedTypeSpec.size, settings)}`;

    if (col.notNull) {
      line += ' NOT NULL';
    }

    if (resolveMySqlAutoIncrementEligibility(col).eligible) {
      line += ' AUTO_INCREMENT';
    }

    if (col.logicalName) {
      line += ` COMMENT '${escapeSql(col.logicalName)}'`;
    }

    const isLast = index === table.columns.length - 1 && !hasPk;
    if (!isLast) {
      line += ',';
    }

    lines.push(line);

    if (col.isPk && col.physicalName) {
      pkCols.push(col.physicalName);
    }
  });

  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')}) USING BTREE`);
  }

  lines.push(`) ENGINE = ${settings.mysqlEngine} CHARACTER SET = ${settings.mysqlCharset} COLLATE = ${settings.mysqlCollate} COMMENT = '${escapeSql(table.logicalTableName)}';`);

  return lines.join('\n');
}

function generateOracle(table: TableInfo, settings: DdlSettings = DEFAULT_SETTINGS): string {
  const lines: string[] = [];

  // Add comment header (if enabled)
  if (settings.includeCommentHeader) {
    if (settings.useCustomHeader && settings.customHeaderTemplate) {
      // Use custom header template with variable substitution
      const customHeader = substituteTemplateVariables(
        settings.customHeaderTemplate,
        table,
        settings.authorName
      );
      lines.push('/*');
      customHeader.split('\n').forEach(line => {
        lines.push(line ? ` ${line}` : '');
      });
      lines.push('*/');
      lines.push('');
    } else {
      // Use default header format
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      lines.push('/*');
      lines.push(` TableName: ${table.logicalTableName}`);
      lines.push(` Author: ${settings.authorName}`);
      lines.push(` Date: ${today}`);
      lines.push('*/');
      lines.push('');
    }
  }

  lines.push(`CREATE TABLE ${table.physicalTableName} (`);

  const pkCols: string[] = [];
  const hasPk = table.columns.some(c => c.isPk);

  table.columns.forEach((col, index) => {
    const normalizedTypeSpec = normalizeDataTypeAndSize(col.dataType, col.size);
    let line = `  ${col.physicalName} ${mapDataTypeOracle(normalizedTypeSpec.type, normalizedTypeSpec.size)}`;

    if (col.notNull) {
      line += ' NOT NULL';
    }

    const isLast = index === table.columns.length - 1 && !hasPk;
    if (!isLast) {
      line += ',';
    }

    lines.push(line);

    if (col.isPk) {
      pkCols.push(col.physicalName!);
    }
  });

  if (pkCols.length > 0) {
    lines.push(`  CONSTRAINT pk_${table.physicalTableName} PRIMARY KEY (${pkCols.join(', ')})`);
  }

  lines.push(`);`);

  lines.push('');
  lines.push(`COMMENT ON TABLE ${table.physicalTableName} IS '${escapeSql(table.logicalTableName)}';`);
  table.columns.forEach(col => {
    if (col.logicalName) {
      lines.push(`COMMENT ON COLUMN ${table.physicalTableName}.${col.physicalName} IS '${escapeSql(col.logicalName)}';`);
    }
  });

  return lines.join('\n');
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

function mapDataTypeMySQL(type?: string, size?: string, settings?: DdlSettings): string {
  const charset = settings?.varcharCharset || 'utf8mb4';
  const collate = settings?.varcharCollate || 'utf8mb4_bin';
  const typeCase = settings?.mysqlDataTypeCase || 'lower';
  const booleanMode = settings?.mysqlBooleanMode || 'tinyint(1)';

  const formatTypeToken = (token: string): string => {
    return typeCase === 'upper' ? token.toUpperCase() : token.toLowerCase();
  };

  if (!type) return `${formatTypeToken('varchar')}(255) CHARACTER SET ${charset} COLLATE ${collate}`;
  const t = type.toLowerCase().trim();
  if (t === 'varchar' || t === 'char') {
    return `${formatTypeToken(t)}(${size || '255'}) CHARACTER SET ${charset} COLLATE ${collate}`;
  }
  if (t === 'tinyint') return size ? `${formatTypeToken('tinyint')}(${size})` : formatTypeToken('tinyint');
  if (t === 'smallint') return size ? `${formatTypeToken('smallint')}(${size})` : formatTypeToken('smallint');
  if (t === 'int' || t === 'integer') return size ? `${formatTypeToken('int')}(${size})` : formatTypeToken('int');
  if (t === 'bigint') return size ? `${formatTypeToken('bigint')}(${size})` : formatTypeToken('bigint');
  if (t === 'date') return formatTypeToken('date');
  if (t === 'datetime') return size ? `${formatTypeToken('datetime')}(${size})` : formatTypeToken('datetime');
  if (t === 'timestamp') return size ? `${formatTypeToken('timestamp')}(${size})` : formatTypeToken('timestamp');
  if (t === 'text') return size ? `${formatTypeToken('text')}(${size})` : formatTypeToken('text');
  if (t === 'longtext') return formatTypeToken('longtext');
  if (t === 'mediumtext') return formatTypeToken('mediumtext');
  if (t === 'decimal' || t === 'numeric') return `${formatTypeToken('decimal')}(${size || '10,2'})`;
  if (t === 'float') return size ? `${formatTypeToken('float')}(${size})` : formatTypeToken('float');
  if (t === 'double') return size ? `${formatTypeToken('double')}(${size})` : formatTypeToken('double');
  if (t === 'boolean' || t === 'bool') {
    if (booleanMode === 'boolean') {
      return formatTypeToken('boolean');
    }
    return `${formatTypeToken('tinyint')}(1)`;
  }
  if (t === 'blob') return formatTypeToken('blob');
  return size ? `${formatTypeToken(t)}(${size})` : formatTypeToken(t);
}

function mapDataTypeOracle(type?: string, size?: string): string {
  if (!type) return 'VARCHAR2(255)';
  const t = type.toLowerCase().trim();
  if (t === 'varchar') return `VARCHAR2(${size || '255'})`;
  if (t === 'char') return `CHAR(${size || '1'})`;
  if (t === 'tinyint' || t === 'smallint' || t === 'int' || t === 'integer' || t === 'bigint') {
    return size ? `NUMBER(${size})` : 'NUMBER';
  }
  if (t === 'date') return 'DATE';
  if (t === 'datetime' || t === 'timestamp') return size ? `TIMESTAMP(${size})` : 'TIMESTAMP';
  if (t === 'text' || t === 'longtext' || t === 'mediumtext') return 'CLOB';
  if (t === 'decimal' || t === 'numeric') return `NUMBER(${size || '10,2'})`;
  if (t === 'float') return size ? `FLOAT(${size})` : 'FLOAT';
  if (t === 'double') return 'BINARY_DOUBLE';
  if (t === 'boolean' || t === 'bool') return 'NUMBER(1)';
  if (t === 'blob') return 'BLOB';
  return size ? `${t.toUpperCase()}(${size})` : t.toUpperCase();
}
