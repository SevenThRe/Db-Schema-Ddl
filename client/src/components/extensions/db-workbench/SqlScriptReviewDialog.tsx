import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SqlStatementSegment } from "./sql-statements";

export interface SqlScriptReviewDialogProps {
  open: boolean;
  statements: SqlStatementSegment[];
  stopOnError: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function statementKindLabel(kind: SqlStatementSegment["kind"]): string {
  switch (kind) {
    case "select":
      return "SELECT";
    case "dml":
      return "DML";
    case "ddl":
      return "DDL";
    case "show":
      return "SHOW";
    case "explain":
      return "EXPLAIN";
    default:
      return "OTHER";
  }
}

export function SqlScriptReviewDialog({
  open,
  statements,
  stopOnError,
  onConfirm,
  onCancel,
}: SqlScriptReviewDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);
  }, [open, statements]);

  const selectedStatement = useMemo(
    () => statements[Math.min(selectedIndex, Math.max(0, statements.length - 1))] ?? null,
    [selectedIndex, statements],
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-5xl overflow-hidden p-0">
        <div className="flex max-h-[78vh] flex-col">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Review SQL script</DialogTitle>
            <DialogDescription>
              {stopOnError
                ? "The script will stop at the first failing statement. After confirmation it still continues through parameter and dangerous-SQL review when applicable."
                : "The script will continue running remaining statements after failures. After confirmation it still continues through parameter and dangerous-SQL review when applicable."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
              {statements.length} statement{statements.length === 1 ? "" : "s"}
            </Badge>
            <span>Review statement order and kind before the standardized execution-review path continues.</span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] divide-x divide-border">
            <ScrollArea className="min-h-0">
              <div className="space-y-2 p-3">
                {statements.map((statement) => {
                  const isSelected = statement.index === selectedStatement?.index;
                  return (
                    <button
                      key={`${statement.index}:${statement.start}`}
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start gap-1 rounded-sm border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-accent/60"
                          : "border-border bg-background hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedIndex(statement.index)}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="text-sm font-medium">Statement {statement.index + 1}</span>
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          {statementKindLabel(statement.kind)}
                        </Badge>
                      </div>
                      <div className="line-clamp-2 font-mono text-[11px] leading-5 text-muted-foreground">
                        {statement.summary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">
                    {selectedStatement ? `Statement ${selectedStatement.index + 1}` : "No statement"}
                  </h3>
                  {selectedStatement ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {statementKindLabel(selectedStatement.kind)}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <pre className="min-h-full whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-foreground">
                  {selectedStatement?.sql ?? "-- No statement selected."}
                </pre>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm}>
              Continue to execution review
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
