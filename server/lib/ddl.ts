import { type TableInfo, type ColumnInfo, type GenerateDdlRequest } from '@shared/schema';

export function generateDDL(request: GenerateDdlRequest): string {
  const { tableInfo, dialect } = request;
  if (dialect === 'mysql') {
    return generateMySQL(tableInfo);
  } else {
    return generateOracle(tableInfo);
  }
}

function generateMySQL(table: TableInfo): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${table.physicalTableName} (`);

  const pkCols: string[] = [];
  
  table.columns.forEach((col, index) => {
    let line = `  ${col.physicalName} ${mapDataTypeMySQL(col.dataType, col.size)}`;
    
    if (col.notNull) {
      line += ' NOT NULL';
    }
    
    if (col.comment) {
      line += ` COMMENT '${col.comment}'`;
    }

    if (index < table.columns.length - 1 || table.columns.some(c => c.isPk)) {
      line += ',';
    }
    
    lines.push(line);

    if (col.isPk) {
      pkCols.push(col.physicalName!);
    }
  });

  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
  }

  lines.push(`) COMMENT='${table.logicalTableName}';`);
  
  return lines.join('\n');
}

function generateOracle(table: TableInfo): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${table.physicalTableName} (`);

  const pkCols: string[] = [];
  
  table.columns.forEach((col, index) => {
    let line = `  ${col.physicalName} ${mapDataTypeOracle(col.dataType, col.size)}`;
    
    if (col.notNull) {
      line += ' NOT NULL';
    }

    if (index < table.columns.length - 1 || table.columns.some(c => c.isPk)) {
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
  
  // Comments
  lines.push(`COMMENT ON TABLE ${table.physicalTableName} IS '${table.logicalTableName}';`);
  table.columns.forEach(col => {
    if (col.comment) {
      lines.push(`COMMENT ON COLUMN ${table.physicalTableName}.${col.physicalName} IS '${col.comment}';`);
    }
  });

  return lines.join('\n');
}

function mapDataTypeMySQL(type?: string, size?: string): string {
  if (!type) return 'VARCHAR(255)';
  const t = type.toLowerCase();
  if (t === 'varchar' || t === 'char') {
    return `${t}(${size || '255'})`;
  }
  if (t === 'int' || t === 'integer') return 'INT';
  if (t === 'bigint') return 'BIGINT';
  if (t === 'date') return 'DATE';
  if (t === 'datetime' || t === 'timestamp') return 'DATETIME';
  if (t === 'decimal' || t === 'numeric') return `DECIMAL(${size || '10,2'})`;
  return t;
}

function mapDataTypeOracle(type?: string, size?: string): string {
  if (!type) return 'VARCHAR2(255)';
  const t = type.toLowerCase();
  if (t === 'varchar') return `VARCHAR2(${size || '255'})`;
  if (t === 'char') return `CHAR(${size || '1'})`;
  if (t === 'int' || t === 'integer' || t === 'bigint') return 'NUMBER';
  if (t === 'date' || t === 'datetime') return 'DATE';
  if (t === 'decimal' || t === 'numeric') return `NUMBER(${size || '10,2'})`;
  return t;
}
