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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SqlLibraryEntry } from "./sql-library";
import { buildSqlPreview } from "./sql-library";

export interface SqlLibraryDialogProps {
  open: boolean;
  searchValue: string;
  entries: SqlLibraryEntry[];
  selectedEntryId: string;
  onSearchValueChange: (value: string) => void;
  onSelectedEntryChange: (entryId: string) => void;
  onReplaceActiveTab: () => void;
  onOpenInNewTab: () => void;
  onDeleteSnippet: () => void;
  onClose: () => void;
}

export function SqlLibraryDialog({
  open,
  searchValue,
  entries,
  selectedEntryId,
  onSearchValueChange,
  onSelectedEntryChange,
  onReplaceActiveTab,
  onOpenInNewTab,
  onDeleteSnippet,
  onClose,
}: SqlLibraryDialogProps) {
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;
  const previewLines = buildSqlPreview(selectedEntry?.sql ?? "");

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-5xl overflow-hidden p-0">
        <div className="flex max-h-[78vh] flex-col">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>SQL library</DialogTitle>
            <DialogDescription>
              Search saved snippets, run history, and legacy recent queries for this
              connection-scoped workspace, then reopen them in the current tab flow.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-border px-5 py-3">
            <Input
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder="Search by snippet name, status, or SQL text"
              autoFocus
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] divide-x divide-border">
            <ScrollArea className="min-h-0">
              <div className="space-y-5 p-3">
                {entries.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No snippets or recent queries match the current filter.
                  </div>
                ) : null}

                {["Saved snippets", "Run history", "Recent queries"].map((groupLabel) => {
                  const groupEntries = entries.filter((entry) => entry.groupLabel === groupLabel);
                  if (groupEntries.length === 0) return null;

                  return (
                    <div key={groupLabel} className="space-y-2">
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {groupLabel}
                      </div>
                      <div className="space-y-1">
                        {groupEntries.map((entry) => {
                          const isSelected = entry.id === selectedEntry?.id;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className={cn(
                                "flex w-full flex-col items-start gap-1 rounded-sm border px-3 py-2 text-left transition-colors",
                                isSelected
                                  ? "border-primary bg-accent/60"
                                  : "border-border bg-background hover:bg-muted/30",
                              )}
                              onClick={() => onSelectedEntryChange(entry.id)}
                            >
                              <div className="flex w-full items-center gap-2">
                                <span className="truncate text-sm font-medium">{entry.title}</span>
                                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                  {entry.kind}
                                </Badge>
                                {entry.status ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-5 rounded-sm px-1.5 text-[10px]",
                                      entry.status === "success"
                                        ? "border-emerald-500/40 text-emerald-700"
                                        : entry.status === "partial"
                                          ? "border-amber-500/40 text-amber-700"
                                          : "border-destructive/40 text-destructive",
                                    )}
                                  >
                                    {entry.status}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="line-clamp-2 font-mono text-[11px] leading-5 text-muted-foreground">
                                {entry.summary}
                              </div>
                              {entry.meta ? (
                                <div className="text-[10px] text-muted-foreground">{entry.meta}</div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">
                    {selectedEntry?.title ?? "No selection"}
                  </h3>
                  {selectedEntry ? (
                    <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                      {selectedEntry.groupLabel}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedEntry
                    ? "Preview the SQL before replacing the active tab or opening a new tab in this connection session."
                    : "Select a snippet, history entry, or recent query to preview it in this connection session."}
                </p>
                {selectedEntry?.meta ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{selectedEntry.meta}</p>
                ) : null}
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <pre className="min-h-full whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-foreground">
                  {previewLines.join("\n")}
                </pre>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <div className="flex w-full items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onDeleteSnippet}
                disabled={!selectedEntry || selectedEntry.kind !== "snippet"}
              >
                Delete snippet
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button type="button" variant="outline" onClick={onOpenInNewTab} disabled={!selectedEntry}>
                  Open in new tab
                </Button>
                <Button type="button" onClick={onReplaceActiveTab} disabled={!selectedEntry}>
                  Replace active tab
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
