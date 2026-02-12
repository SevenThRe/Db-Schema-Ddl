import { type TableInfo, type ColumnInfo, type GenerateDdlRequest } from '@shared/schema';

export function generateDDL(request: GenerateDdlRequest): string {
  const { tables, dialect } = request;
  const ddls = tables.map(table => {
    if (dialect === 'mysql') {
      return generateMySQL(table);
    } else {
      return generateOracle(table);
    }
  });
  return ddls.join('\n\n');
}

function generateMySQL(table: TableInfo): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE \`${table.physicalTableName}\` (`);

  const pkCols: string[] = [];
  const hasPk = table.columns.some(c => c.isPk);

  table.columns.forEach((col, index) => {
    let line = `  \`${col.physicalName}\` ${mapDataTypeMySQL(col.dataType, col.size)}`;

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

    if (col.isPk) {
      pkCols.push(`\`${col.physicalName}\``);
    }
  });

  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
  }

  lines.push(`) COMMENT='${escapeSql(table.logicalTableName)}';`);

  return lines.join('\n');
}

function generateOracle(table: TableInfo): string {
  const lines: string[] = [];
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

function mapDataTypeMySQL(type?: string, size?: string): string {
  if (!type) return 'VARCHAR(255)';
  const t = type.toLowerCase().trim();
  if (t === 'varchar' || t === 'char') {
    return `${t.toUpperCase()}(${size || '255'})`;
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
