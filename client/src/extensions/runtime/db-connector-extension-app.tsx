import { useEffect, useMemo, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { StatusBarProvider } from "@/status-bar/context";
import { queryClient } from "@/lib/queryClient";
import { ExtensionHostStaticProvider } from "@/extensions/host-context";
import type { HostApi } from "@/extensions/host-api";
import { DbConnectorWorkspace } from "@/components/extensions/DbConnectorWorkspace";
import { DbConnectionsSidebarView } from "@/components/extensions/db-workbench/sidebar/DbConnectionsSidebarView";
import { DbExplorerSidebarView } from "@/components/extensions/db-workbench/sidebar/DbExplorerSidebarView";
import { createExtensionRuntimeBridge } from "./runtime-bridge";
import type { RuntimeInitPayload } from "./protocol";

function createRuntimeHostApi(bridge: ReturnType<typeof createExtensionRuntimeBridge>): HostApi {
  return {
    notifications: {
      show: (options) => {
        void bridge.requestHost("notifications.show", options);
      },
    },
    connections: {
      list: () => bridge.requestHost("connections.list"),
      discoverLocal: () => bridge.requestHost("connections.discoverLocal"),
      save: (config) => bridge.requestHost("connections.save", config),
      remove: (id) => bridge.requestHost("connections.remove", id),
      test: (config) => bridge.requestHost("connections.test", config),
      introspect: (connectionId) => bridge.requestHost("connections.introspect", connectionId),
      inspectObject: (request) => bridge.requestHost("connections.inspectObject", request),
      listSchemas: (connectionId) => bridge.requestHost("connections.listSchemas", connectionId),
      diff: (sourceId, targetId) => bridge.requestHost("connections.diff", sourceId, targetId),
      executeQuery: (request) => bridge.requestHost("connections.executeQuery", request),
      explainQuery: (request) => bridge.requestHost("connections.explainQuery", request),
      cancelQuery: (requestId) => bridge.requestHost("connections.cancelQuery", requestId),
      previewDangerousSql: (connectionId, sql, cursorOffset) =>
        bridge.requestHost("connections.previewDangerousSql", connectionId, sql, cursorOffset),
      exportRows: (request) => bridge.requestHost("connections.exportRows", request),
      fetchMore: (request) => bridge.requestHost("connections.fetchMore", request),
      prepareGridCommit: (request) => bridge.requestHost("connections.prepareGridCommit", request),
      commitGridEdits: (request) => bridge.requestHost("connections.commitGridEdits", request),
      previewDataDiff: (request) => bridge.requestHost("connections.previewDataDiff", request),
      fetchDataDiffDetail: (request) => bridge.requestHost("connections.fetchDataDiffDetail", request),
      previewDataApply: (request) => bridge.requestHost("connections.previewDataApply", request),
      executeDataApply: (request) => bridge.requestHost("connections.executeDataApply", request),
      fetchDataApplyJobDetail: (request) =>
        bridge.requestHost("connections.fetchDataApplyJobDetail", request),
      listBackgroundJobs: (request) => bridge.requestHost("connections.listBackgroundJobs", request),
    },
    statusBar: {
      set: (entry) => {
        void bridge.requestHost("statusBar.set", entry);
        return () => {
          void bridge.requestHost("statusBar.clear", entry.id);
        };
      },
      clear: (id) => {
        void bridge.requestHost("statusBar.clear", id);
      },
      clearAll: () => {
        void bridge.requestHost("statusBar.clearAll");
      },
    },
  };
}

function RuntimeLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
      Loading extension runtime...
    </div>
  );
}

function renderRuntimeSurface(
  init: RuntimeInitPayload,
  bridge: ReturnType<typeof createExtensionRuntimeBridge>,
) {
  const extensionId = init.extension.manifest.id;

  switch (init.runtimeViewId) {
    case "db-connector.sidebar.connections":
      return (
        <DbConnectionsSidebarView
          extensionId={extensionId}
          activityItemId="db-connector-activity"
          sidebarViewId={init.surfaceId}
          workbenchViewId="db-connector-workbench"
          onNavigate={() => {}}
          onSelectSidebarView={(sidebarViewId) => bridge.selectSidebarView(sidebarViewId)}
          onOpenWorkbenchView={(workbenchViewId) => bridge.openWorkbenchView(workbenchViewId)}
        />
      );
    case "db-connector.sidebar.explorer":
      return (
        <DbExplorerSidebarView
          extensionId={extensionId}
          activityItemId="db-connector-activity"
          sidebarViewId={init.surfaceId}
          workbenchViewId="db-connector-workbench"
          onNavigate={() => {}}
          onSelectSidebarView={(sidebarViewId) => bridge.selectSidebarView(sidebarViewId)}
          onOpenWorkbenchView={(workbenchViewId) => bridge.openWorkbenchView(workbenchViewId)}
        />
      );
    case "db-connector.workbench.main":
      return (
        <DbConnectorWorkspace
          extensionId={extensionId}
          workbenchViewId="db-connector-workbench"
        />
      );
    default:
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Unknown runtime view: {init.runtimeViewId}
        </div>
      );
  }
}

export function DbConnectorExtensionApp() {
  const bridge = useMemo(() => createExtensionRuntimeBridge(window), []);
  const [init, setInit] = useState<RuntimeInitPayload | null>(null);

  useEffect(() => {
    const unsubscribe = bridge.onInit((payload) => setInit(payload));
    bridge.start();
    return () => {
      unsubscribe();
      bridge.dispose();
    };
  }, [bridge]);

  const scopedHostApis = useMemo<Record<string, HostApi>>(
    () =>
      init
        ? {
            [init.extension.manifest.id]: createRuntimeHostApi(bridge),
          }
        : {},
    [bridge, init],
  );

  if (!init) {
    return <RuntimeLoadingState />;
  }

  return (
    <ThemeProvider defaultTheme="system">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <StatusBarProvider>
            <ExtensionHostStaticProvider
              extensions={[init.extension]}
              scopedHostApis={scopedHostApis}
            >
              {renderRuntimeSurface(init, bridge)}
            </ExtensionHostStaticProvider>
          </StatusBarProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
