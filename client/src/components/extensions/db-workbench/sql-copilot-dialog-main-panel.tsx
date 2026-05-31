import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatGenerationMode } from "./sql-copilot-dialog-model";
import type { SqlCopilotDialogContentProps } from "./sql-copilot-dialog-sections";
import { SqlCopilotGeneratedDraftReview } from "./SqlCopilotGeneratedDraftReview";

export interface SqlCopilotMainPanelProps
  extends Pick<
    SqlCopilotDialogContentProps,
    | "promptPackage"
    | "generationPromptPackage"
    | "generationMode"
    | "operatorPrompt"
    | "probeResult"
    | "probeError"
    | "generatedDraft"
    | "generationError"
    | "hasUnsavedSettings"
    | "isRunningProbe"
    | "isGeneratingDraft"
    | "onOperatorPromptChange"
    | "onRunWarmup"
    | "onRunProbe"
    | "onGenerateDraft"
    | "onReplaceActiveTabWithDraft"
    | "onOpenDraftInNewTab"
    | "onRunDraftWithSafetyGates"
  > {
  runtimeActionDisabled: boolean;
}

export function SqlCopilotMainPanel({
  promptPackage,
  generationPromptPackage,
  generationMode,
  operatorPrompt,
  probeResult,
  probeError,
  generatedDraft,
  generationError,
  hasUnsavedSettings,
  runtimeActionDisabled,
  isRunningProbe,
  isGeneratingDraft,
  onOperatorPromptChange,
  onRunWarmup,
  onRunProbe,
  onGenerateDraft,
  onReplaceActiveTabWithDraft,
  onOpenDraftInNewTab,
  onRunDraftWithSafetyGates,
}: SqlCopilotMainPanelProps) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_220px]">
      <SqlCopilotPromptControls
        promptPackage={promptPackage}
        generationPromptPackage={generationPromptPackage}
        generationMode={generationMode}
        operatorPrompt={operatorPrompt}
        hasUnsavedSettings={hasUnsavedSettings}
        runtimeActionDisabled={runtimeActionDisabled}
        isRunningProbe={isRunningProbe}
        isGeneratingDraft={isGeneratingDraft}
        onOperatorPromptChange={onOperatorPromptChange}
        onRunWarmup={onRunWarmup}
        onRunProbe={onRunProbe}
        onGenerateDraft={onGenerateDraft}
      />
      <SqlCopilotPromptPreview
        promptPackage={promptPackage}
        generationPromptPackage={generationPromptPackage}
        generationMode={generationMode}
        generatedDraft={generatedDraft}
        generationError={generationError}
        onReplaceActiveTabWithDraft={onReplaceActiveTabWithDraft}
        onOpenDraftInNewTab={onOpenDraftInNewTab}
        onRunDraftWithSafetyGates={onRunDraftWithSafetyGates}
      />
      <SqlCopilotLatestModelOutput
        probeResult={probeResult}
        probeError={probeError}
      />
    </div>
  );
}

interface SqlCopilotPromptControlsProps
  extends Pick<
    SqlCopilotMainPanelProps,
    | "promptPackage"
    | "generationPromptPackage"
    | "generationMode"
    | "operatorPrompt"
    | "hasUnsavedSettings"
    | "runtimeActionDisabled"
    | "isRunningProbe"
    | "isGeneratingDraft"
    | "onOperatorPromptChange"
    | "onRunWarmup"
    | "onRunProbe"
    | "onGenerateDraft"
  > {}

function SqlCopilotPromptControls({
  promptPackage,
  generationPromptPackage,
  generationMode,
  operatorPrompt,
  hasUnsavedSettings,
  runtimeActionDisabled,
  isRunningProbe,
  isGeneratingDraft,
  onOperatorPromptChange,
  onRunWarmup,
  onRunProbe,
  onGenerateDraft,
}: SqlCopilotPromptControlsProps) {
  return (
    <div className="border-b border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="sql-copilot-operator-prompt" className="text-xs">
          Optional operator request
        </Label>
        <Textarea
          id="sql-copilot-operator-prompt"
          value={operatorPrompt}
          onChange={(event) => onOperatorPromptChange(event.target.value)}
          placeholder="Describe the SQL you want, refine the current draft, or leave this empty and let the model complete the partial SQL already in the editor."
          className="min-h-[96px] resize-none text-xs leading-6"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onRunWarmup}
          disabled={runtimeActionDisabled}
        >
          {isRunningProbe ? "Running..." : "Warm up runtime"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onRunProbe}
          disabled={runtimeActionDisabled}
        >
          {isRunningProbe ? "Running grounded probe..." : "Run grounded probe"}
        </Button>
        <Button type="button" onClick={onGenerateDraft} disabled={runtimeActionDisabled}>
          {isGeneratingDraft ? "Generating SQL draft..." : "Generate SQL draft"}
        </Button>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {promptPackage.groundingSummary.relationCount} relations
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {promptPackage.groundingSummary.memoryPatternCount} memory patterns
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {promptPackage.groundingSummary.valueProfileCount} value profiles
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            mode: {formatGenerationMode(generationMode)}
          </Badge>
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {generationPromptPackage.groundingSummary.promptCharCount} chars
          </Badge>
        </div>
      </div>
      {hasUnsavedSettings ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Save runtime settings before probing or generating so backend runtime state and prompt
          grounding stay in sync.
        </p>
      ) : null}
    </div>
  );
}

function SqlCopilotPromptPreview({
  promptPackage,
  generationPromptPackage,
  generationMode,
  generatedDraft,
  generationError,
  onReplaceActiveTabWithDraft,
  onOpenDraftInNewTab,
  onRunDraftWithSafetyGates,
}: Pick<
  SqlCopilotMainPanelProps,
  | "promptPackage"
  | "generationPromptPackage"
  | "generationMode"
  | "generatedDraft"
  | "generationError"
  | "onReplaceActiveTabWithDraft"
  | "onOpenDraftInNewTab"
  | "onRunDraftWithSafetyGates"
>) {
  return (
    <ScrollArea className="min-h-0">
      <div className="space-y-4 p-4">
        {promptPackage.sections.map((section) => (
          <section key={section.title} className="rounded-sm border border-border bg-background">
            <div className="border-b border-border px-3 py-2">
              <div className="text-sm font-semibold">{section.title}</div>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
              {section.body}
            </pre>
          </section>
        ))}
        <section className="rounded-sm border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-semibold">Prompt preview</div>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {promptPackage.promptPreview}
          </pre>
        </section>
        <section className="rounded-sm border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-semibold">Generated SQL prompt preview</div>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {generationPromptPackage.promptPreview}
          </pre>
        </section>
        <SqlCopilotGeneratedDraftReview
          generationMode={generationMode}
          generatedDraft={generatedDraft}
          generationError={generationError}
          onReplaceActiveTabWithDraft={onReplaceActiveTabWithDraft}
          onOpenDraftInNewTab={onOpenDraftInNewTab}
          onRunDraftWithSafetyGates={onRunDraftWithSafetyGates}
        />
      </div>
    </ScrollArea>
  );
}

function SqlCopilotLatestModelOutput({
  probeResult,
  probeError,
}: Pick<SqlCopilotMainPanelProps, "probeResult" | "probeError">) {
  return (
    <div className="border-t border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Latest model output</div>
          <p className="mt-1 text-xs text-muted-foreground">
            This is model output only. It is not executed SQL, not a planner result, and not a
            schema guarantee. Executing a generated draft still goes through the normal parameter
            review, dangerous-SQL confirmation, and runtime guards.
          </p>
        </div>
        {probeResult?.latencyMs ? (
          <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
            {probeResult.latencyMs} ms
          </Badge>
        ) : null}
      </div>
      <Textarea
        readOnly
        value={
          probeError ??
          probeResult?.outputText ??
          "Run a warmup, advisory probe, or generated draft request to capture local model output."
        }
        className="h-[120px] resize-none font-mono text-xs leading-6"
      />
    </div>
  );
}
