import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DbSchemaDiffResult,
  DbSchemaSnapshot,
} from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";

export function useDbConnectorCompatibilityState({
  host,
  selectedConnId,
  toast,
}: {
  host: HostApi;
  selectedConnId: string | null;
  toast: HostApi["notifications"]["show"];
}) {
  const { data: snapshot, isFetching: isIntrospecting, refetch: refetchSchema } = useQuery({
    queryKey: ["/db/schema", selectedConnId],
    queryFn: () => host.connections.introspect(selectedConnId!),
    enabled: selectedConnId !== null,
    staleTime: 30_000,
  });

  const [diffSourceId, setDiffSourceId] = useState<string>("");
  const [diffTargetId, setDiffTargetId] = useState<string>("");
  const [diffResult, setDiffResult] = useState<DbSchemaDiffResult | null>(null);
  const [diffSourceSnapshot, setDiffSourceSnapshot] =
    useState<DbSchemaSnapshot | null>(null);
  const [diffTargetSnapshot, setDiffTargetSnapshot] =
    useState<DbSchemaSnapshot | null>(null);
  const [isDiffing, setIsDiffing] = useState(false);

  const clearDiff = useCallback(() => {
    setDiffResult(null);
    setDiffSourceSnapshot(null);
    setDiffTargetSnapshot(null);
  }, []);

  const runDiff = useCallback(async () => {
    if (!diffSourceId || !diffTargetId) return;
    setIsDiffing(true);
    clearDiff();
    try {
      const [src, tgt, result] = await Promise.all([
        host.connections.introspect(diffSourceId),
        host.connections.introspect(diffTargetId),
        host.connections.diff(diffSourceId, diffTargetId),
      ]);
      setDiffSourceSnapshot(src);
      setDiffTargetSnapshot(tgt);
      setDiffResult(result);
    } catch (e) {
      toast({ title: "对比失败", description: String(e), variant: "destructive" });
    } finally {
      setIsDiffing(false);
    }
  }, [clearDiff, diffSourceId, diffTargetId, host, toast]);

  const clearDeletedConnectionFromDiff = useCallback((deletedId: string) => {
    if (diffSourceId === deletedId) {
      setDiffSourceId("");
    }
    if (diffTargetId === deletedId) {
      setDiffTargetId("");
    }
  }, [diffSourceId, diffTargetId]);

  return {
    schema: {
      snapshot,
      isIntrospecting,
      refetchSchema,
    },
    diff: {
      diffSourceId,
      diffTargetId,
      diffResult,
      diffSourceSnapshot,
      diffTargetSnapshot,
      isDiffing,
      setDiffSourceId,
      setDiffTargetId,
      runDiff,
      clearDiff,
      clearDeletedConnectionFromDiff,
    },
  };
}
