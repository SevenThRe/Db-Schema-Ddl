import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  PendingDeleteRowSummary,
  PendingEditRowSummary,
  PendingInsertedRowSummary,
} from "./grid-edit-summary";
import { formatGridCellValue } from "./grid-edit-summary";

export interface GridEditCommitDialogProps {
  open: boolean;
  affectedRows: number;
  insertedRows: number;
  updatedRows: number;
  deletedRows: number;
  changedColumnsSummary: string[];
  pendingRows: PendingEditRowSummary[];
  pendingDeletedRows: PendingDeleteRowSummary[];
  pendingInsertedRows: PendingInsertedRowSummary[];
  sqlPreviewLines: string[];
  previewTruncated: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GridEditCommitDialog({
  open,
  affectedRows,
  insertedRows,
  updatedRows,
  deletedRows,
  changedColumnsSummary,
  pendingRows,
  pendingDeletedRows,
  pendingInsertedRows,
  sqlPreviewLines,
  previewTruncated,
  isConfirming = false,
  onConfirm,
  onCancel,
}: GridEditCommitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-3xl border border-destructive/40 bg-background">
        <DialogHeader>
          <DialogTitle>Apply pending row edits</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm text-foreground">
              <p>
                <span className="font-semibold">Affected rows</span>: {affectedRows}
              </p>
              <p>
                Inserts: {insertedRows} · Updates: {updatedRows} · Deletes: {deletedRows}
              </p>
              {changedColumnsSummary.length > 0 ? (
                <p>
                  Columns: {changedColumnsSummary.join(", ")}
                </p>
              ) : null}
              {pendingInsertedRows.length > 0 ? (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">
                    Pending Row Inserts
                  </p>
                  <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
                    {pendingInsertedRows.map((row) => (
                      <div
                        key={row.rowDraftId}
                        className="rounded-sm border border-sky-500/20 bg-background px-2 py-1.5"
                      >
                        <p className="font-mono text-xs font-semibold text-foreground">
                          {row.rowLabel}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.fieldCount} field{row.fieldCount === 1 ? "" : "s"} included
                        </p>
                        {row.cells.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {row.cells.map((cell) => (
                              <p
                                key={`${row.rowDraftId}:${cell.columnName}`}
                                className="font-mono text-[11px] text-foreground"
                              >
                                {cell.columnName}: {formatGridCellValue(cell.value)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            No explicit values yet. Omitted columns will use database defaults.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {pendingRows.length > 0 ? (
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Pending Rows
                  </p>
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto pr-1">
                    {pendingRows.map((row) => (
                      <div
                        key={row.rowPkTuple}
                        className="rounded-sm border border-border bg-background px-2 py-1.5"
                      >
                        <p className="font-mono text-xs font-semibold text-foreground">
                          {row.rowKeyLabel}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.changeCount} pending field{row.changeCount > 1 ? "s" : ""}
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {row.cells.map((cell) => (
                            <p key={`${row.rowPkTuple}:${cell.columnName}`} className="font-mono text-[11px] text-foreground">
                              {cell.columnName}: {formatGridCellValue(cell.beforeValue)} {"->"}{" "}
                              {formatGridCellValue(cell.nextValue)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {pendingDeletedRows.length > 0 ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-destructive">
                    Pending Row Deletes
                  </p>
                  <div className="mt-2 max-h-32 space-y-2 overflow-auto pr-1">
                    {pendingDeletedRows.map((row) => (
                      <div
                        key={row.rowPkTuple}
                        className="rounded-sm border border-destructive/30 bg-background px-2 py-1.5"
                      >
                        <p className="font-mono text-xs font-semibold text-foreground">
                          {row.rowKeyLabel}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  SQL Preview
                </p>
                {sqlPreviewLines.length > 0 ? (
                  <pre className="mt-2 max-h-48 overflow-auto rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs">
                    {sqlPreviewLines.join("\n")}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No preview lines were returned.
                  </p>
                )}
                {previewTruncated ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Preview is truncated. Additional statements will execute during commit.
                  </p>
                ) : null}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isConfirming}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "Committing..." : "Commit edits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
