import { useTableInfo } from "@/hooks/use-ddl";
import { Loader2, AlertTriangle, Key, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TableInfo, ColumnInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import * as ReactWindow from "react-window";

const FixedSizeList = (ReactWindow as any).FixedSizeList;

interface TablePreviewProps {
  fileId: number | null;
  sheetName: string | null;
}

// 虚拟滚动的行组件
function VirtualRow({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: { columns: ColumnInfo[]; t: any };
}) {
  const { columns, t } = data;
  const col = columns[index];

  return (
    <div
      style={style}
      className="grid grid-cols-[50px_40px_1fr_1fr_120px_80px_80px] gap-2 px-4 border-b border-border hover:bg-muted/30 transition-colors items-center"
    >
      <div className="font-mono text-xs text-muted-foreground">{col.no || index + 1}</div>
      <div>
        {col.isPk && (
          <Key className="w-3.5 h-3.5 text-amber-500 rotate-45" />
        )}
      </div>
      <div className="font-medium text-foreground truncate" title={col.logicalName}>
        {col.logicalName}
      </div>
      <div className="font-mono text-xs text-muted-foreground truncate" title={col.physicalName}>
        {col.physicalName}
      </div>
      <div>
        <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold tracking-wider">
          {col.dataType}
        </Badge>
      </div>
      <div className="font-mono text-xs">{col.size}</div>
      <div className="text-center">
        {col.notNull ? (
          <span className="inline-block w-2 h-2 rounded-full bg-red-400" title={t("table.notNull")} />
        ) : (
          <span className="inline-block w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" title={t("table.nullable")} />
        )}
      </div>
    </div>
  );
}

// 单个表格预览组件（使用虚拟滚动）
function SingleTablePreview({ table }: { table: TableInfo }) {
  const { t } = useTranslation();
  const containerHeight = Math.min(600, table.columns.length * 40 + 100); // 最大高度 600px

  return (
    <div className="space-y-4">
      {/* 表头信息 */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-3 flex-wrap">
          {table.logicalTableName || "Untitled Table"}
          <Badge variant="outline" className="font-mono font-normal text-xs text-muted-foreground">
            {table.physicalTableName || "NO_PHYSICAL_NAME"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {table.columns.length} {t("table.columns")}
        </p>
      </div>

      {/* 表格容器 */}
      <div className="border border-border rounded-md overflow-hidden bg-card">
        {/* 表格头 */}
        <div className="grid grid-cols-[50px_40px_1fr_1fr_120px_80px_80px] gap-2 px-4 py-3 bg-muted/50 border-b border-border font-medium text-sm">
          <div>No.</div>
          <div></div>
          <div>{t("table.logicalName")}</div>
          <div>{t("table.physicalName")}</div>
          <div>{t("table.type")}</div>
          <div>{t("table.size")}</div>
          <div className="text-center">{t("table.null")}</div>
        </div>

        {/* 虚拟滚动列表 */}
        <FixedSizeList
          height={containerHeight}
          itemCount={table.columns.length}
          itemSize={40}
          width="100%"
          itemData={{ columns: table.columns, t }}
        >
          {VirtualRow}
        </FixedSizeList>
      </div>
    </div>
  );
}

export function TablePreview({ fileId, sheetName }: TablePreviewProps) {
  const { data: tables, isLoading, error } = useTableInfo(fileId, sheetName);
  const { t } = useTranslation();
  const [currentTableIndex, setCurrentTableIndex] = useState(0);

  // 当前选中的表
  const currentTable = useMemo(() => {
    if (!tables || tables.length === 0) return null;
    return tables[currentTableIndex] || tables[0];
  }, [tables, currentTableIndex]);

  if (!fileId || !sheetName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p>{t("table.selectSheet")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p>{t("table.parsing")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t("table.invalidDefinition")}</h3>
        <p className="text-muted-foreground text-sm">
          {error.message || t("table.parseError")}
        </p>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertTriangle className="w-8 h-8 mb-4 opacity-50" />
        <p className="text-sm">{t("table.noTables")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-border bg-card/50 flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            {t("table.tablesFound", { count: tables.length })} <span className="font-medium text-foreground">{sheetName}</span>
          </p>
        </div>

        {/* 表格切换器 */}
        {tables.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentTableIndex(Math.max(0, currentTableIndex - 1))}
              disabled={currentTableIndex === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <Select
              value={currentTableIndex.toString()}
              onValueChange={(value) => setCurrentTableIndex(parseInt(value))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table, idx) => (
                  <SelectItem key={idx} value={idx.toString()}>
                    {table.logicalTableName || table.physicalTableName || `Table ${idx + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentTableIndex(Math.min(tables.length - 1, currentTableIndex + 1))}
              disabled={currentTableIndex === tables.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <span className="text-xs text-muted-foreground ml-2">
              {currentTableIndex + 1} / {tables.length}
            </span>
          </div>
        )}
      </div>

      {/* 表格内容区域 */}
      <div className="flex-1 overflow-auto bg-background/30 p-6">
        {currentTable && <SingleTablePreview table={currentTable} />}
      </div>
    </div>
  );
}
