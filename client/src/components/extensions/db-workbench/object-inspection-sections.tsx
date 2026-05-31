import { Copy, Database, FileCode2, ListTree } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DbObjectInspectionResponse } from "@shared/schema";

export function formatObjectKind(kind: DbObjectInspectionResponse["objectKind"]): string {
  return kind.replace(/_/g, " ");
}

export function defaultDdlText(inspection: DbObjectInspectionResponse): string {
  if (inspection.ddl?.trim()) {
    return inspection.ddl;
  }
  if (inspection.unsupportedMessage?.trim()) {
    return inspection.unsupportedMessage;
  }
  return "-- No DDL available for the selected object.";
}

export function ObjectInspectionLoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-xs text-muted-foreground">
        Loading object definition...
      </span>
    </div>
  );
}

export function ObjectInspectionEmptyState({
  error,
  className,
}: {
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-3 text-center", className)}>
      <div className="rounded-full border border-border bg-muted/30 p-3">
        <FileCode2 className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">选择一个对象开始检查</p>
        <p className="text-xs text-muted-foreground">
          {error ??
            "当前 inspection 支持 tables、views、functions/procedures、triggers、PostgreSQL sequences、indexes 和 foreign keys。"}
        </p>
      </div>
    </div>
  );
}

export function ObjectInspectionHeader({
  inspection,
  onCopy,
}: {
  inspection: DbObjectInspectionResponse;
  onCopy: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {inspection.displayName}
          </span>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] uppercase">
            {formatObjectKind(inspection.objectKind)}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "h-5 rounded-sm px-1.5 text-[10px] uppercase",
              inspection.supported
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {inspection.supported ? "supported" : "unsupported"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>
            {inspection.database} / {inspection.schema}
          </span>
        </div>
        {inspection.comment ? (
          <p className="text-[11px] text-muted-foreground">{inspection.comment}</p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onCopy}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy DDL
      </Button>
    </div>
  );
}

export function ObjectInspectionCoverageAlert({
  inspection,
}: {
  inspection: DbObjectInspectionResponse;
}) {
  if (inspection.supported && inspection.coverageNotes.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border bg-panel-muted/40 px-3 py-2">
      <Alert className="rounded-sm border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <AlertTitle className="text-xs">Inspection coverage</AlertTitle>
        <AlertDescription className="space-y-1 text-[11px]">
          {inspection.unsupportedMessage ? (
            <p>{inspection.unsupportedMessage}</p>
          ) : null}
          {inspection.coverageNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function ObjectInspectionDdlView({
  ddlText,
}: {
  ddlText: string;
}) {
  return (
    <div className="p-3">
      <pre className="whitespace-pre-wrap rounded-sm border border-border bg-background p-3 font-mono text-xs text-foreground">
        {ddlText}
      </pre>
    </div>
  );
}

export function ObjectInspectionMetadataView({
  inspection,
  onInspectObject,
  onOpenTable,
}: {
  inspection: DbObjectInspectionResponse;
  onInspectObject?: (objectKind: DbObjectInspectionResponse["objectKind"], objectName: string) => void;
  onOpenTable?: (tableName: string) => void;
}) {
  return (
    <div className="space-y-3 p-3">
      {inspection.definitionSql ? (
        <section className="rounded-sm border border-border bg-background">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Definition SQL
          </div>
          <pre className="overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-foreground">
            {inspection.definitionSql}
          </pre>
        </section>
      ) : null}

      <section className="rounded-sm border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <ListTree className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Columns
          </span>
        </div>
        {inspection.columns.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No column metadata available.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {inspection.columns.map((column) => (
              <div
                key={`inspect-column-${column.name}`}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_140px] gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-foreground">
                    {column.name}
                  </div>
                  {column.comment ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {column.comment}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <div className="truncate font-mono text-foreground">
                    {column.dataType}
                  </div>
                  {column.defaultValue ? (
                    <div className="mt-1 truncate">
                      default {column.defaultValue}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {column.primaryKey ? (
                    <Badge
                      variant="outline"
                      className="h-5 rounded-sm border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      PK
                    </Badge>
                  ) : null}
                  {!column.nullable ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      NOT NULL
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-background">
        <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Indexes
        </div>
        {inspection.indexes.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No index metadata available.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {inspection.indexes.map((index) => (
              <div
                key={`inspect-index-${index.name}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-foreground">
                    {index.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {index.columns.join(", ")}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {index.primary ? (
                    <Badge
                      variant="outline"
                      className="h-5 rounded-sm border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      PRIMARY
                    </Badge>
                  ) : null}
                  {index.unique ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      UNIQUE
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-background">
        <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Foreign Keys
        </div>
        {inspection.foreignKeys.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No foreign key metadata available.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {inspection.foreignKeys.map((foreignKey) => (
              <div
                key={`inspect-fk-${foreignKey.name}`}
                className="px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-foreground">
                      {foreignKey.name}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {foreignKey.columns.join(", ")} {"->"} {foreignKey.referencedTable}
                      {" ("}
                      {foreignKey.referencedColumns.join(", ")}
                      {")"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onInspectObject?.("table", foreignKey.referencedTable)}
                    >
                      Inspect ref
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onOpenTable?.(foreignKey.referencedTable)}
                    >
                      Open ref
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
