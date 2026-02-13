import { type TableInfo, type ColumnInfo, type GenerateDdlRequest, type DdlSettings } from '@shared/schema';

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
};

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
  const { tables, dialect, settings = DEFAULT_SETTINGS } = request;
  const ddls = tables.map(table => {
    if (dialect === 'mysql') {
      return generateMySQL(table, settings);
    } else {
      return generateOracle(table, settings);
    }
  });
  return ddls.join('\n\n');
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
    let line = `  \`${col.physicalName}\` ${mapDataTypeMySQL(col.dataType, col.size, settings)}`;

    if (col.notNull) {
      line += ' NOT NULL';
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
    let line = `  ${col.physicalName} ${mapDataTypeOracle(col.dataType, col.size)}`;

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

  if (!type) return `VARCHAR(255) CHARACTER SET ${charset} COLLATE ${collate}`;
  const t = type.toLowerCase().trim();
  if (t === 'varchar' || t === 'char') {
    return `${t.toUpperCase()}(${size || '255'}) CHARACTER SET ${charset} COLLATE ${collate}`;
  }
  if (t === 'tinyint') return size ? `TINYINT(${size})` : 'TINYINT';
  if (t === 'smallint') return size ? `SMALLINT(${size})` : 'SMALLINT';
  if (t === 'int' || t === 'integer') return size ? `INT(${size})` : 'INT';
  if (t === 'bigint') return size ? `BIGINT(${size})` : 'BIGINT';
  if (t === 'date') return 'DATE';
  if (t === 'datetime') return size ? `DATETIME(${size})` : 'DATETIME';
  if (t === 'timestamp') return size ? `TIMESTAMP(${size})` : 'TIMESTAMP';
  if (t === 'text') return size ? `TEXT(${size})` : 'TEXT';
  if (t === 'longtext') return 'LONGTEXT';
  if (t === 'mediumtext') return 'MEDIUMTEXT';
  if (t === 'decimal' || t === 'numeric') return `DECIMAL(${size || '10,2'})`;
  if (t === 'float') return size ? `FLOAT(${size})` : 'FLOAT';
  if (t === 'double') return size ? `DOUBLE(${size})` : 'DOUBLE';
  if (t === 'boolean' || t === 'bool') return 'BOOLEAN';
  if (t === 'blob') return 'BLOB';
  return size ? `${t.toUpperCase()}(${size})` : t.toUpperCase();
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
