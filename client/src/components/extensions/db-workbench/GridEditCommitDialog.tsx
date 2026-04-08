import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface GridEditCommitDialogProps {
  open: boolean;
  affectedRows: number;
  changedColumnsSummary: string[];
  sqlPreviewLines: string[];
  previewTruncated: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GridEditCommitDialog({
  open,
  affectedRows,
  changedColumnsSummary,
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
              {changedColumnsSummary.length > 0 ? (
                <p>
                  Columns: {changedColumnsSummary.join(", ")}
                </p>
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
