import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export interface SaveSnippetDialogProps {
  open: boolean;
  snippetName: string;
  sqlPreview: string;
  willOverwrite: boolean;
  onSnippetNameChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaveSnippetDialog({
  open,
  snippetName,
  sqlPreview,
  willOverwrite,
  onSnippetNameChange,
  onConfirm,
  onCancel,
}: SaveSnippetDialogProps) {
  const normalizedName = snippetName.trim();
  const trimmedPreview = sqlPreview.trim();
  const previewLines =
    trimmedPreview.length > 0
      ? trimmedPreview.split(/\r?\n/).slice(0, 6)
      : ["-- Active tab is empty."];
  const isConfirmDisabled = normalizedName.length === 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Save SQL snippet</DialogTitle>
          <DialogDescription className="text-sm">
            Store the active SQL for this connection so it can be reinserted into future query tabs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="save-snippet-name">Snippet name</Label>
              {willOverwrite ? (
                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[11px]">
                  Existing snippet will be updated
                </Badge>
              ) : null}
            </div>
            <Input
              id="save-snippet-name"
              value={snippetName}
              onChange={(event) => onSnippetNameChange(event.target.value)}
              placeholder="Customer cleanup script"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isConfirmDisabled) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>SQL preview</Label>
              <span className="text-[11px] text-muted-foreground">
                {previewLines.length} line{previewLines.length === 1 ? "" : "s"} shown
              </span>
            </div>
            <pre className="max-h-44 overflow-auto rounded-sm border border-border bg-muted/20 p-3 font-mono text-xs leading-6 text-foreground">
              {previewLines.join("\n")}
            </pre>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isConfirmDisabled}>
            Save snippet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
