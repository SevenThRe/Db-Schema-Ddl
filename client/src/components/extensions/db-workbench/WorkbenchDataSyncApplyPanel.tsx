import { Lock } from "lucide-react";
import type {
  DbBackgroundJobSummary,
  DbConnectionConfig,
  DbDataApplyExecuteResponse,
  DbDataApplyPreviewResponse,
  DbDataDiffPreviewResponse,
} from "@shared/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  describeDataSyncBlocker,
  formatDataSyncCounts,
} from "./data-sync-utils";

interface WorkbenchDataSyncApplyPanelProps {
  applyReadyMessage: string;
  onPreviewDataApply: () => void;
  isApplyPreviewing: boolean;
  onExecuteDataApply: () => void;
  canExecuteDataApply: boolean;
  isExecutingApply: boolean;
  activeApplyJobId: string | null;
  onOpenJobCenterForJob: (jobId: string) => void;
  diffPreview: DbDataDiffPreviewResponse | null;
  applyPreview: DbDataApplyPreviewResponse | null;
  applyPreviewHasBlockingGuard: boolean;
  applyPreviewHasUnsafeDeleteWarning: boolean;
  applyUnsafeDeleteConfirmed: boolean;
  onUnsafeDeleteConfirmedChange: (confirmed: boolean) => void;
  deleteWarningThreshold: number;
  syncRequiresProdTypedConfirmation: boolean;
  activeSyncTargetConnection: DbConnectionConfig;
  applyProdConfirmation: string;
  onProdConfirmationChange: (confirmation: string) => void;
  applyExecute: DbDataApplyExecuteResponse | null;
  selectedBackgroundJob: DbBackgroundJobSummary | null;
}

export function WorkbenchDataSyncApplyPanel({
  applyReadyMessage,
  onPreviewDataApply,
  isApplyPreviewing,
  onExecuteDataApply,
  canExecuteDataApply,
  isExecutingApply,
  activeApplyJobId,
  onOpenJobCenterForJob,
  diffPreview,
  applyPreview,
  applyPreviewHasBlockingGuard,
  applyPreviewHasUnsafeDeleteWarning,
  applyUnsafeDeleteConfirmed,
  onUnsafeDeleteConfirmedChange,
  deleteWarningThreshold,
  syncRequiresProdTypedConfirmation,
  activeSyncTargetConnection,
  applyProdConfirmation,
  onProdConfirmationChange,
  applyExecute,
  selectedBackgroundJob,
}: WorkbenchDataSyncApplyPanelProps) {
  return (
    <div className="shrink-0 border-t border-border bg-panel-muted/40 px-3 py-2">
      <Alert className="mb-2 rounded-sm border-border bg-background px-3 py-2">
        <Lock className="h-4 w-4" />
        <AlertTitle className="text-xs">Data Sync Apply</AlertTitle>
        <AlertDescription className="text-[11px] text-muted-foreground">
          {applyReadyMessage}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          onClick={onPreviewDataApply}
          disabled={!diffPreview || isApplyPreviewing}
        >
          {isApplyPreviewing ? "Previewing..." : "Preview apply"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!canExecuteDataApply}
          onClick={onExecuteDataApply}
        >
          {isExecutingApply ? "Applying..." : "Apply selected changes"}
        </Button>
        {activeApplyJobId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => onOpenJobCenterForJob(activeApplyJobId)}
          >
            Open Job Center
          </Button>
        ) : null}
      </div>

      {applyPreview ? (
        <div className="mt-2 space-y-1 text-[11px]">
          <p className="font-mono text-foreground">
            apply preview: {formatDataSyncCounts(applyPreview.statusCounts)}
          </p>
          <p className="text-muted-foreground">
            target snapshot {applyPreview.currentTargetSnapshotHash}
          </p>
          <p className="text-muted-foreground">
            executable: {applyPreview.executable ? "yes" : "no"}
          </p>
          {applyPreview.sqlPreviewLines.length > 0 ? (
            <pre className="max-h-28 overflow-auto rounded-sm border border-border bg-background p-2 font-mono text-[11px]">
              {applyPreview.sqlPreviewLines.join("\n")}
            </pre>
          ) : null}
          {applyPreview.blockers.length > 0 ? (
            <div
              className={cn(
                "rounded-sm border p-2",
                applyPreviewHasBlockingGuard
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {applyPreview.blockers.map((blocker) => (
                <p key={`apply-blocker-${blocker.code}`}>
                  {blocker.code}: {describeDataSyncBlocker(blocker.code)}
                </p>
              ))}
            </div>
          ) : null}
          {applyPreviewHasUnsafeDeleteWarning ? (
            <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
              <p>
                unsafe_delete_threshold warning is active. Review delete volume before execute.
              </p>
              <label className="mt-2 inline-flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={applyUnsafeDeleteConfirmed}
                  onChange={(event) => onUnsafeDeleteConfirmedChange(event.target.checked)}
                />
                <span>
                  I confirm that delete volume above {deleteWarningThreshold} rows is intentional.
                </span>
              </label>
            </div>
          ) : null}
          <p className="text-muted-foreground">
            Review the SQL preview and blockers, then run apply when the target is ready.
          </p>
        </div>
      ) : null}

      {syncRequiresProdTypedConfirmation && (
        <div className="mt-2 rounded-sm border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-[11px] text-destructive">
            typed confirmation required for prod target.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Type target database name: {activeSyncTargetConnection.database}
          </p>
          <input
            value={applyProdConfirmation}
            onChange={(event) => onProdConfirmationChange(event.target.value)}
            placeholder={activeSyncTargetConnection.database}
            className="mt-1 h-8 w-full rounded-sm border border-border bg-background px-2 text-xs"
          />
        </div>
      )}

      {applyExecute ? (
        <div className="mt-2 rounded-sm border border-border bg-background p-2 text-[11px]">
          <p className="font-mono">
            apply result job: {applyExecute.jobId} ({applyExecute.status})
          </p>
          <p className="mt-1 text-muted-foreground">
            {formatDataSyncCounts(applyExecute.statusCounts)}
          </p>
          {applyExecute.status === "running" ? (
            <p className="mt-1 text-muted-foreground">
              Background job is running. Monitor it from Job Center.
            </p>
          ) : null}
        </div>
      ) : null}
      {selectedBackgroundJob ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Selected job in Job Center: {selectedBackgroundJob.jobId} ({selectedBackgroundJob.status})
        </p>
      ) : null}
    </div>
  );
}
