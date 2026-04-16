import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PendingDeleteRowSummary, PendingEditRowSummary } from "./grid-edit-summary";
import { formatGridCellValue } from "./grid-edit-summary";

export interface GridEditCommitDialogProps {
  open: boolean;
  affectedRows: number;
  updatedRows: number;
  deletedRows: number;
  changedColumnsSummary: string[];
  pendingRows: PendingEditRowSummary[];
  pendingDeletedRows: PendingDeleteRowSummary[];
  sqlPreviewLines: string[];
  previewTruncated: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GridEditCommitDialog({
  open,
  affectedRows,
  updatedRows,
  deletedRows,
  changedColumnsSummary,
  pendingRows,
  pendingDeletedRows,
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
                Updates: {updatedRows} · Deletes: {deletedRows}
              </p>
              {changedColumnsSummary.length > 0 ? (
                <p>
                  Columns: {changedColumnsSummary.join(", ")}
                </p>
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
