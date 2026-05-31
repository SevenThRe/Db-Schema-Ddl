import { FileSearch, GitCompare } from "lucide-react";
import type { DbQueryBatchResult } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkbenchResultTab } from "./workbench-session";
import {
  ResultExportMenu,
  type ExportFormat,
  type ExportScope,
} from "./ResultExportMenu";

export interface WorkbenchResultWorkspaceHeaderProps {
  resultTab: WorkbenchResultTab;
  onResultTabChange: (tab: WorkbenchResultTab) => void;
  activeBatch: DbQueryBatchResult | null;
  onExport: (scope: ExportScope, format: ExportFormat) => void;
  isExporting: boolean;
  schemaDiffContextLabel: string;
  inspectionContextLabel: string;
}

export function WorkbenchResultWorkspaceHeader({
  resultTab,
  onResultTabChange,
  activeBatch,
  onExport,
  isExporting,
  schemaDiffContextLabel,
  inspectionContextLabel,
}: WorkbenchResultWorkspaceHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-panel-muted px-2 py-1">
      <Tabs
        value={resultTab}
        onValueChange={(value) => onResultTabChange(value as WorkbenchResultTab)}
      >
        <TabsList className="h-7">
          <TabsTrigger value="results" className="h-6 text-xs">
            Results
          </TabsTrigger>
          <TabsTrigger value="explain" className="h-6 text-xs">
            Explain
          </TabsTrigger>
          <TabsTrigger value="schema-diff" className="h-6 text-xs">
            <GitCompare className="mr-1 h-3.5 w-3.5" />
            Schema Diff
          </TabsTrigger>
          <TabsTrigger value="sync" className="h-6 text-xs">
            <GitCompare className="mr-1 h-3.5 w-3.5" />
            Sync
            <span className="ml-1 text-[10px] uppercase text-muted-foreground">
              Preview
            </span>
          </TabsTrigger>
          <TabsTrigger value="inspect" className="h-6 text-xs">
            <FileSearch className="mr-1 h-3.5 w-3.5" />
            Inspect
          </TabsTrigger>
          <TabsTrigger value="jobs" className="h-6 text-xs">
            Jobs
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {resultTab === "results" && activeBatch ? (
        <ResultExportMenu
          batch={activeBatch}
          onExport={onExport}
          isExporting={isExporting}
          supportsFullResultExport={activeBatch.pagingMode === "offset"}
        />
      ) : null}
      {resultTab === "schema-diff" ? (
        <div className="truncate text-[11px] text-muted-foreground">
          {schemaDiffContextLabel}
        </div>
      ) : null}
      {resultTab === "sync" ? (
        <div className="text-[11px] text-muted-foreground">
          Preview surface · source -&gt; target
        </div>
      ) : null}
      {resultTab === "inspect" ? (
        <div className="truncate text-[11px] text-muted-foreground">
          {inspectionContextLabel}
        </div>
      ) : null}
      {resultTab === "jobs" ? (
        <div className="truncate text-[11px] text-muted-foreground">
          Shipped support surface · persistent background job history
        </div>
      ) : null}
    </div>
  );
}
