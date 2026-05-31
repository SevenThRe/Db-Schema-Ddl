// DB Workbench shell.
//
// Runtime truth:
// - `Database Workspace` is the canonical daily-driver DB route.
// - `Connection Center` is the primary support surface for connection setup/recovery.
// - retained schema/diff paths stay reachable only as compatibility surfaces until parity and
//   regression proof make removal safe.

import { useHostApiFor } from "@/extensions/host-context";
import {
  DbConnectorWorkspaceShell,
} from "./db-workbench/DbConnectorWorkspaceShell";
import { DbConnectorWorkspaceTabs } from "./db-workbench/DbConnectorWorkspaceTabs";
import { useDbConnectorWorkspaceController } from "./db-workbench/use-db-connector-workspace-controller";
import type { ExtensionWorkspaceProps } from "@/extensions/panel-registry";

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function DbConnectorWorkspace({
  extensionId,
  workbenchViewId,
}: Pick<ExtensionWorkspaceProps, "extensionId" | "workbenchViewId">) {
  // Capability スコープ済み HostApi を使用する（extensionId で権限を絞り込む）
  const host = useHostApiFor(extensionId);
  const controller = useDbConnectorWorkspaceController({
    host,
    workbenchViewId,
  });

  return (
    <DbConnectorWorkspaceShell {...controller.shellProps}>
      <DbConnectorWorkspaceTabs
        extensionId={extensionId}
        host={host}
        {...controller.tabsProps}
      />
    </DbConnectorWorkspaceShell>
  );
}
