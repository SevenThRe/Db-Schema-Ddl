import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DbColumnSchema, DbTableSchema } from "@shared/schema";

function ColumnBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-sm px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

function ColumnRow({ column }: { column: DbColumnSchema }) {
  return (
    <div className="rounded-sm border border-border bg-background px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">
          {column.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {column.primaryKey ? (
            <ColumnBadge className="border-amber-200 bg-amber-500/10 text-amber-700">
              PK
            </ColumnBadge>
          ) : null}
          {!column.nullable ? <ColumnBadge>NOT NULL</ColumnBadge> : null}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{column.dataType}</span>
        {column.defaultValue ? (
          <span className="truncate">default {column.defaultValue}</span>
        ) : null}
      </div>
      {column.comment ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
          {column.comment}
        </p>
      ) : null}
    </div>
  );
}

export function ConnectionSidebarTableStructure({
  selectedTable,
  isSelectedTableInspected,
  onInspectTable,
  onOpenTable,
  onRunStarterQuery,
}: {
  selectedTable?: DbTableSchema | null;
  isSelectedTableInspected: boolean;
  onInspectTable?: (tableName: string) => void;
  onOpenTable?: (tableName: string) => void;
  onRunStarterQuery?: (
    tableName: string,
    mode: "select" | "count" | "columns",
  ) => void;
}) {
  const secondaryIndexes = (selectedTable?.indexes ?? []).filter((index) => !index.primary);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background/70">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Structure
          </span>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {selectedTable?.name ?? "No table selected"}
          </p>
        </div>
        {selectedTable ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={isSelectedTableInspected ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => onInspectTable?.(selectedTable.name)}
            >
              Inspect
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11px]"
              onClick={() => onOpenTable?.(selectedTable.name)}
            >
              <Play className="h-3 w-3" />
              Open
            </Button>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!selectedTable ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            Select a table to preview columns.
          </div>
        ) : (
          <div className="space-y-2 px-2 py-2">
            <div className="grid grid-cols-3 gap-1">
              <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                <div className="text-[11px] text-muted-foreground">Columns</div>
                <div className="text-xs font-semibold text-foreground">
                  {selectedTable.columns.length}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                <div className="text-[11px] text-muted-foreground">Keys</div>
                <div className="text-xs font-semibold text-foreground">
                  {selectedTable.columns.filter((column) => column.primaryKey).length +
                    (selectedTable.foreignKeys?.length ?? 0)}
                </div>
              </div>
              <div className="rounded-sm border border-border bg-muted/20 px-2 py-1">
                <div className="text-[11px] text-muted-foreground">Indexes</div>
                <div className="text-xs font-semibold text-foreground">
                  {secondaryIndexes.length}
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-border bg-muted/20 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs font-semibold text-foreground">
                  {selectedTable.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {selectedTable.columns.length} cols
                </span>
              </div>
              {selectedTable.comment ? (
                <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                  {selectedTable.comment}
                </p>
              ) : null}
            </div>

            <div className="rounded-sm border border-border bg-background px-2 py-1.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Starter Queries
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 justify-start text-[11px]"
                  onClick={() => onRunStarterQuery?.(selectedTable.name, "select")}
                >
                  Select top 100
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 justify-start text-[11px]"
                  onClick={() => onRunStarterQuery?.(selectedTable.name, "count")}
                >
                  Count rows
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 justify-start text-[11px]"
                  onClick={() => onRunStarterQuery?.(selectedTable.name, "columns")}
                >
                  Select explicit columns
                </Button>
              </div>
            </div>

            {secondaryIndexes.length > 0 ? (
              <div className="rounded-sm border border-border bg-background px-2 py-1.5">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Indexes
                </div>
                <div className="space-y-1">
                  {secondaryIndexes.map((index) => (
                    <div key={index.name} className="text-[11px]">
                      <div className="font-mono text-foreground">{index.name}</div>
                      <div className="mt-0.5 text-muted-foreground">
                        {index.columns.join(", ")}
                        {index.unique ? " · UNIQUE" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedTable.columns.map((column) => (
              <ColumnRow key={column.name} column={column} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
