import type { WorkbenchDataSyncPaneProps } from "./WorkbenchDataSyncPane";
import { hasBlockingDataSyncBlocker } from "./data-sync-utils";

type DataSyncPassthroughProps = Omit<
  WorkbenchDataSyncPaneProps,
  | "applyPreviewHasBlockingGuard"
  | "applyPreviewHasUnsafeDeleteWarning"
  | "canExecuteDataApply"
  | "syncRequiresProdTypedConfirmation"
>;

export type BuildWorkbenchDataSyncPropsInput = DataSyncPassthroughProps;

export function buildWorkbenchDataSyncProps(
  input: BuildWorkbenchDataSyncPropsInput,
): WorkbenchDataSyncPaneProps {
  const syncRequiresProdTypedConfirmation =
    input.activeSyncTargetConnection.environment === "prod";
  const applyPreviewHasBlockingGuard = hasBlockingDataSyncBlocker(
    input.applyPreview?.blockers,
  );
  const applyPreviewHasUnsafeDeleteWarning =
    input.applyPreview?.blockers.some(
      (blocker) => blocker.code === "unsafe_delete_threshold",
    ) ?? false;
  const canExecuteDataApply =
    !!input.applyPreview &&
    input.applyPreview.executable &&
    !applyPreviewHasBlockingGuard &&
    !input.isExecutingApply &&
    (!applyPreviewHasUnsafeDeleteWarning || input.applyUnsafeDeleteConfirmed) &&
    (!syncRequiresProdTypedConfirmation ||
      input.applyProdConfirmation.trim() ===
        input.activeSyncTargetConnection.database);

  return {
    ...input,
    applyPreviewHasBlockingGuard,
    applyPreviewHasUnsafeDeleteWarning,
    canExecuteDataApply,
    syncRequiresProdTypedConfirmation,
  };
}
