import type { HostApi } from "../host-api";

export async function dispatchRuntimeHostCall(
  hostApi: HostApi,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case "notifications.show":
      hostApi.notifications.show((args[0] ?? {}) as Parameters<HostApi["notifications"]["show"]>[0]);
      return null;
    case "statusBar.set":
      hostApi.statusBar.set((args[0] ?? {}) as Parameters<HostApi["statusBar"]["set"]>[0]);
      return null;
    case "statusBar.clear":
      hostApi.statusBar.clear(String(args[0] ?? ""));
      return null;
    case "statusBar.clearAll":
      hostApi.statusBar.clearAll();
      return null;
    case "connections.list":
      return await hostApi.connections.list();
    case "connections.discoverLocal":
      return await hostApi.connections.discoverLocal();
    case "connections.save":
      return await hostApi.connections.save(args[0] as Parameters<HostApi["connections"]["save"]>[0]);
    case "connections.remove":
      return await hostApi.connections.remove(String(args[0] ?? ""));
    case "connections.test":
      return await hostApi.connections.test(args[0] as Parameters<HostApi["connections"]["test"]>[0]);
    case "connections.introspect":
      return await hostApi.connections.introspect(String(args[0] ?? ""));
    case "connections.inspectObject":
      return await hostApi.connections.inspectObject(args[0] as Parameters<HostApi["connections"]["inspectObject"]>[0]);
    case "connections.listSchemas":
      return await hostApi.connections.listSchemas?.(String(args[0] ?? "")) ?? [];
    case "connections.diff":
      return await hostApi.connections.diff(String(args[0] ?? ""), String(args[1] ?? ""));
    case "connections.executeQuery":
      return await hostApi.connections.executeQuery(args[0] as Parameters<HostApi["connections"]["executeQuery"]>[0]);
    case "connections.explainQuery":
      return await hostApi.connections.explainQuery(args[0] as Parameters<HostApi["connections"]["explainQuery"]>[0]);
    case "connections.cancelQuery":
      return await hostApi.connections.cancelQuery(String(args[0] ?? ""));
    case "connections.previewDangerousSql":
      return await hostApi.connections.previewDangerousSql(
        String(args[0] ?? ""),
        String(args[1] ?? ""),
        typeof args[2] === "number" ? args[2] : undefined,
      );
    case "connections.exportRows":
      return await hostApi.connections.exportRows(args[0] as Parameters<HostApi["connections"]["exportRows"]>[0]);
    case "connections.fetchMore":
      return await hostApi.connections.fetchMore(args[0] as Parameters<HostApi["connections"]["fetchMore"]>[0]);
    case "connections.prepareGridCommit":
      return await hostApi.connections.prepareGridCommit(args[0] as Parameters<HostApi["connections"]["prepareGridCommit"]>[0]);
    case "connections.commitGridEdits":
      return await hostApi.connections.commitGridEdits(args[0] as Parameters<HostApi["connections"]["commitGridEdits"]>[0]);
    case "connections.previewDataDiff":
      return await hostApi.connections.previewDataDiff(args[0] as Parameters<HostApi["connections"]["previewDataDiff"]>[0]);
    case "connections.fetchDataDiffDetail":
      return await hostApi.connections.fetchDataDiffDetail(args[0] as Parameters<HostApi["connections"]["fetchDataDiffDetail"]>[0]);
    case "connections.previewDataApply":
      return await hostApi.connections.previewDataApply(args[0] as Parameters<HostApi["connections"]["previewDataApply"]>[0]);
    case "connections.executeDataApply":
      return await hostApi.connections.executeDataApply(args[0] as Parameters<HostApi["connections"]["executeDataApply"]>[0]);
    case "connections.fetchDataApplyJobDetail":
      return await hostApi.connections.fetchDataApplyJobDetail(args[0] as Parameters<HostApi["connections"]["fetchDataApplyJobDetail"]>[0]);
    case "connections.listBackgroundJobs":
      return await hostApi.connections.listBackgroundJobs(args[0] as Parameters<HostApi["connections"]["listBackgroundJobs"]>[0]);
    default:
      throw new Error(`Unknown runtime host method: ${method}`);
  }
}
