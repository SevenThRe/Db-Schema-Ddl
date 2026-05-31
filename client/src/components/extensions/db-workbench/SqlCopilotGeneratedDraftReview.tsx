import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  SqlCopilotGeneratedDraft,
  SqlCopilotGenerationMode,
} from "./sql-copilot-generation";
import { formatGenerationMode } from "./sql-copilot-dialog-model";

interface SqlCopilotGeneratedDraftReviewProps {
  generationMode: SqlCopilotGenerationMode;
  generatedDraft: SqlCopilotGeneratedDraft | null;
  generationError: string | null;
  onReplaceActiveTabWithDraft: () => void;
  onOpenDraftInNewTab: () => void;
  onRunDraftWithSafetyGates: () => void;
}

function ReviewList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: string[];
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item}
              className="rounded-sm border border-border bg-muted/20 px-2 py-1.5 text-xs"
            >
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

export function SqlCopilotGeneratedDraftReview({
  generationMode,
  generatedDraft,
  generationError,
  onReplaceActiveTabWithDraft,
  onOpenDraftInNewTab,
  onRunDraftWithSafetyGates,
}: SqlCopilotGeneratedDraftReviewProps) {
  const hasUsableDraft = Boolean(generatedDraft?.sql.trim());

  return (
    <section className="rounded-sm border border-border bg-background">
      <div className="border-b border-border px-3 py-2">
        <div className="text-sm font-semibold">Generated draft review</div>
      </div>
      <div className="space-y-3 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            mode: {formatGenerationMode(generationMode)}
          </Badge>
          {generatedDraft ? (
            <>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                hallucination {generatedDraft.hallucinationRisk ? "risk" : "clear"}
              </Badge>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                safety {generatedDraft.safetyRegression ? "regression" : "clear"}
              </Badge>
              <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                {generatedDraft.diagnostics.length} diagnostics
              </Badge>
            </>
          ) : null}
        </div>
        {generationError ? (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {generationError}
          </div>
        ) : null}
        {generatedDraft ? (
          <>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Summary
              </div>
              <div className="mt-1 text-sm">
                {generatedDraft.summary ?? "Generated SQL draft"}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ReviewList
                title="Assumptions"
                emptyText="No explicit assumptions were returned."
                items={generatedDraft.assumptions}
              />
              <ReviewList
                title="Safety notes"
                emptyText="No extra safety notes were generated."
                items={generatedDraft.safetyNotes}
              />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Draft SQL
              </div>
              <Textarea
                readOnly
                value={generatedDraft.sql || "The model did not return a usable SQL draft."}
                className="mt-2 h-[180px] resize-none font-mono text-xs leading-6"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onReplaceActiveTabWithDraft}
                disabled={!hasUsableDraft}
              >
                Replace active tab
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onOpenDraftInNewTab}
                disabled={!hasUsableDraft}
              >
                Open in new tab
              </Button>
              <Button
                type="button"
                onClick={onRunDraftWithSafetyGates}
                disabled={!hasUsableDraft}
              >
                Run generated draft with safety gates
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-sm border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Generate a draft to review grounded assumptions before accepting or executing anything.
          </div>
        )}
      </div>
    </section>
  );
}
