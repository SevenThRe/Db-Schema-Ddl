import { useTableInfo } from "@/hooks/use-ddl";
import { Loader2, AlertTriangle, Key } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TableInfo } from "@shared/schema";
import { useTranslation } from "react-i18next";

interface TablePreviewProps {
  fileId: number | null;
  sheetName: string | null;
}

function SingleTablePreview({ table, sheetName }: { table: TableInfo; sheetName: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-3 flex-wrap" data-testid={`text-table-name-${table.physicalTableName}`}>
          {table.logicalTableName || "Untitled Table"}
          <Badge variant="outline" className="font-mono font-normal text-xs text-muted-foreground">
            {table.physicalTableName || "NO_PHYSICAL_NAME"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          {table.columns.length} {t("table.columns")}
        </p>
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[50px]">No.</TableHead>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>{t("table.logicalName")}</TableHead>
              <TableHead>{t("table.physicalName")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead>{t("table.size")}</TableHead>
              <TableHead className="w-[80px] text-center">{t("table.null")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.columns.map((col, idx) => (
              <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-mono text-xs text-muted-foreground">{col.no || idx + 1}</TableCell>
                <TableCell>
                  {col.isPk && (
                    <Key className="w-3.5 h-3.5 text-amber-500 rotate-45" />
                  )}
                </TableCell>
                <TableCell className="font-medium text-foreground">{col.logicalName}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{col.physicalName}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold tracking-wider">
                    {col.dataType}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{col.size}</TableCell>
                <TableCell className="text-center">
                  {col.notNull ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-red-400" title={t("table.notNull")} />
                  ) : (
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" title={t("table.nullable")} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function TablePreview({ fileId, sheetName }: TablePreviewProps) {
  const { data: tables, isLoading, error } = useTableInfo(fileId, sheetName);
  const { t } = useTranslation();

  if (!fileId || !sheetName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Table className="w-8 h-8 text-muted-foreground/50" />
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
      <div className="p-4 border-b border-border bg-card/50">
        <p className="text-sm text-muted-foreground">
          {t("table.tablesFound", { count: tables.length })} <span className="font-medium text-foreground">{sheetName}</span>
        </p>
      </div>

      <ScrollArea className="flex-1 w-full bg-background/30">
        <div className="p-6">
          {tables.map((table, idx) => (
            <SingleTablePreview key={idx} table={table} sheetName={sheetName} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
