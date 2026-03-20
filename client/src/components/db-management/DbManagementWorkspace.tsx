import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, FileSpreadsheet, GitBranch, History, Network, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY,
  useCreateDbConnection,
  useDbConnections,
  useDbDatabases,
  useDeleteDbConnection,
  useIntrospectDbSchema,
  useParseDbConnectionImports,
  useSelectDbDatabase,
  useTestDbConnection,
  useUpdateDbConnection,
} from "@/hooks/use-db-management";
import { ConnectionManager } from "./ConnectionManager";
import { DatabaseSelector } from "./DatabaseSelector";
import { SchemaIntrospectionPanel } from "./SchemaIntrospectionPanel";
import { DbApplyPanel } from "./DbApplyPanel";
import { DbDiffWorkspace, type DbDiffWorkspaceStateSnapshot } from "./DbDiffWorkspace";
import { DbHistoryPanel } from "./DbHistoryPanel";
import { DbLiveExportWorkspace } from "./DbLiveExportWorkspace";
import { DbSchemaGraph } from "./DbSchemaGraph";
import { DbSnapshotCompareWorkspace, type DbSnapshotCompareWorkspaceSeed } from "./DbSnapshotCompareWorkspace";
import { DbVsDbWorkspace } from "./DbVsDbWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DbConnectionImportDraft, DbConnectionUpsertRequest } from "@shared/schema";
import type { DbManagementViewMode } from "@shared/schema";

interface DbManagementWorkspaceProps {
  onActivateFile?: (fileId: number) => void;
  selectedFileId: number | null;
  selectedSheet: string | null;
  selectedFileName?: string | null;
}

const DEFAULT_DIFF_STATE: DbDiffWorkspaceStateSnapshot = {
  compareResult: null,
  lastCompareInput: null,
  renameDecisions: {},
  sqlPreviewResult: null,
  dryRunResult: null,
};

const VIEW_MODES: readonly DbManagementViewMode[] = ["diff", "db-vs-db", "snapshot-compare", "live-export", "history", "apply", "graph"];
const VIEW_META: Record<DbManagementViewMode, { title: string; description: string }> = {
  diff: {
    title: "定义对照",
    description: "对照定义书与当前库。",
  },
  "db-vs-db": {
    title: "库对库",
    description: "对比两个真实库。",
  },
  "snapshot-compare": {
    title: "快照对比",
    description: "比较历史快照。",
  },
  "live-export": {
    title: "导出 XLSX",
    description: "把当前库导回 XLSX。",
  },
  history: {
    title: "历史",
    description: "查看当前库的快照历史。",
  },
  apply: {
    title: "执行变更",
    description: "只执行通过检查的变更。",
  },
  graph: {
    title: "关系图",
    description: "查看表关系图。",
  },
};

function readStoredViewMode(): DbManagementViewMode {
  if (typeof window === "undefined") {
    return "diff";
  }
  const requested = new URLSearchParams(window.location.search).get("db-view");
  if (VIEW_MODES.includes(requested as DbManagementViewMode)) {
    return requested as DbManagementViewMode;
  }
  const stored = window.localStorage.getItem(DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY);
  return VIEW_MODES.includes(stored as DbManagementViewMode) ? (stored as DbManagementViewMode) : "diff";
}

export function DbManagementWorkspace({ onActivateFile, selectedFileId, selectedSheet, selectedFileName }: DbManagementWorkspaceProps) {
  const { toast } = useToast();
  const { data: connections = [] } = useDbConnections();
  const createConnection = useCreateDbConnection();
  const updateConnection = useUpdateDbConnection();
  const deleteConnection = useDeleteDbConnection();
  const testConnection = useTestDbConnection();
  const selectDatabase = useSelectDbDatabase();
  const introspectSchema = useIntrospectDbSchema();
  const parseConnectionImports = useParseDbConnectionImports();
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<DbManagementViewMode>(() => readStoredViewMode());
  const [diffState, setDiffState] = useState<DbDiffWorkspaceStateSnapshot>(DEFAULT_DIFF_STATE);
  const [snapshotCompareSeed, setSnapshotCompareSeed] = useState<DbSnapshotCompareWorkspaceSeed | null>(null);

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );
  const { data: databases = [], isLoading: isDatabasesLoading } = useDbDatabases(selectedConnectionId);

  const latestResult =
    introspectSchema.data && introspectSchema.data.connection.id === selectedConnectionId
      ? introspectSchema.data
      : null;
  const activeViewMeta = VIEW_META[activeView];
  const selectedDatabaseLabel = selectedConnection?.lastSelectedDatabase ?? "未选择数据库";
  const connectionLabel = selectedConnection
    ? `${selectedConnection.username}@${selectedConnection.host}:${selectedConnection.port}`
    : "选择或创建一个连接";
  const workbookLabel = selectedFileName && selectedSheet
    ? `${selectedFileName} / ${selectedSheet}`
    : selectedFileName || selectedSheet || "未绑定工作簿上下文";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  const handleSaveConnection = async (
    input: DbConnectionUpsertRequest,
    connectionId?: number,
  ) => {
    try {
      if (connectionId && connectionId > 0) {
        const updated = await updateConnection.mutateAsync({ id: connectionId, input });
        setSelectedConnectionId(updated.id);
        toast({
          title: "DB 管理",
          description: `连接 ${updated.name} 已更新。`,
        });
        return;
      }

      const created = await createConnection.mutateAsync(input);
      setSelectedConnectionId(created.id);
      toast({
        title: "DB 管理",
        description: `连接 ${created.name} 已保存。`,
      });
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "保存连接失败。",
        variant: "destructive",
      });
    }
  };

  const handleParseConnectionImports = async (input: { content: string; fileName?: string }) => {
    try {
      return await parseConnectionImports.mutateAsync(input);
    } catch (error) {
      toast({
        title: "连接导入",
        description: error instanceof Error ? error.message : "解析连接配置失败。",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleSaveImportedDrafts = async (drafts: DbConnectionImportDraft[]) => {
    const existingNames = new Set(connections.map((connection) => connection.name.toLowerCase()));
    let importedCount = 0;
    let skippedCount = 0;
    let lastImportedId: number | null = null;

    for (const draft of drafts) {
      if (draft.missingFields.length > 0 || !draft.password || !draft.username.trim()) {
        skippedCount += 1;
        continue;
      }

      let candidateName = draft.name.trim() || "imported-mysql";
      let suffix = 2;
      while (existingNames.has(candidateName.toLowerCase())) {
        candidateName = `${draft.name} (${suffix})`;
        suffix += 1;
      }

      const created = await createConnection.mutateAsync({
        name: candidateName,
        host: draft.host,
        port: draft.port,
        username: draft.username.trim(),
        password: draft.password,
        rememberPassword: true,
        clearSavedPassword: false,
        sslMode: draft.sslMode,
      });

      existingNames.add(candidateName.toLowerCase());
      importedCount += 1;
      lastImportedId = created.id;
    }

    if (lastImportedId) {
      setSelectedConnectionId(lastImportedId);
    }

    toast({
      title: "连接导入",
      description:
        skippedCount > 0
          ? `已导入 ${importedCount} 条连接，另有 ${skippedCount} 条仍需补全用户名或密码。`
          : `已导入 ${importedCount} 条连接。`,
      variant: importedCount > 0 ? "default" : "destructive",
    });
  };

  const handleDeleteConnection = async (connectionId: number) => {
    try {
      await deleteConnection.mutateAsync(connectionId);
      setSelectedConnectionId((current) => (current === connectionId ? null : current));
      toast({
        title: "DB 管理",
        description: "连接已删除。",
      });
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "删除连接失败。",
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async (connectionId: number) => {
    try {
      const result = await testConnection.mutateAsync(connectionId);
      toast({
        title: "连接测试",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "连接测试",
        description: error instanceof Error ? error.message : "连接测试失败。",
        variant: "destructive",
      });
    }
  };

  const handleSelectDatabase = async (databaseName: string) => {
    if (!selectedConnection) {
      return;
    }

    try {
      await selectDatabase.mutateAsync({
        connectionId: selectedConnection.id,
        databaseName,
      });
    } catch (error) {
      toast({
        title: "DB 管理",
        description: error instanceof Error ? error.message : "切换数据库失败。",
        variant: "destructive",
      });
    }
  };

  const handleIntrospect = async () => {
    if (!selectedConnection?.lastSelectedDatabase) {
      toast({
        title: "DB 管理",
        description: "请先选择一个数据库。",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await introspectSchema.mutateAsync({
        connectionId: selectedConnection.id,
        input: {
          databaseName: selectedConnection.lastSelectedDatabase,
          forceRefresh: true,
        },
      });
      toast({
        title: "快照读取完成",
        description: `${result.selectedDatabase} 已生成 ${result.snapshot.tableCount} 张表的快照。`,
      });
    } catch (error) {
      toast({
        title: "快照读取失败",
        description: error instanceof Error ? error.message : "读取快照失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <section className="border-b border-border px-4 py-2.5">
        <div className="flex flex-col gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[hsl(var(--workspace-ink))]">数据库管理</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="truncate">连接: {connectionLabel}</span>
              <span className="truncate">数据库: {selectedDatabaseLabel}</span>
              <span className="truncate">文件: {workbookLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[1.22fr_0.78fr]">
          <ConnectionManager
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            onSelectConnection={(connectionId) => setSelectedConnectionId(connectionId > 0 ? connectionId : null)}
            onSave={handleSaveConnection}
            onDelete={handleDeleteConnection}
            onTest={handleTestConnection}
            onParseImports={handleParseConnectionImports}
            onSaveImportedDrafts={handleSaveImportedDrafts}
            isSaving={createConnection.isPending || updateConnection.isPending}
            isDeleting={deleteConnection.isPending}
            isTesting={testConnection.isPending}
            isImporting={parseConnectionImports.isPending}
          />
          <Card className="border-border shadow-none">
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">当前模式</div>
                  <div className="mt-1 text-sm font-medium text-[hsl(var(--workspace-ink))]">{activeViewMeta.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{activeViewMeta.description}</div>
                </div>
                <div className="border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">最近快照</div>
                  <div className="mt-1 text-sm font-medium text-[hsl(var(--workspace-ink))]">
                    {latestResult ? `${latestResult.snapshot.tableCount} 张表` : "未读取"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {latestResult ? latestResult.selectedDatabase : "选择数据库后读取快照。"}
                  </div>
                </div>
              </div>

              <DatabaseSelector
                databases={databases}
                selectedDatabase={selectedConnection?.lastSelectedDatabase ?? null}
                disabled={!selectedConnection}
                isLoading={isDatabasesLoading || testConnection.isPending}
                onSelectDatabase={handleSelectDatabase}
              />

              <SchemaIntrospectionPanel
                connection={selectedConnection}
                selectedDatabase={selectedConnection?.lastSelectedDatabase ?? null}
                lastResult={latestResult}
                isPending={introspectSchema.isPending}
                onIntrospect={handleIntrospect}
              />
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 border border-border bg-background">
          <Tabs value={activeView} onValueChange={(value) => setActiveView(value as DbManagementViewMode)} className="min-h-0">
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-sm font-medium text-[hsl(var(--workspace-ink))]">{activeViewMeta.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{activeViewMeta.description}</div>
                </div>
                <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-sm border border-border bg-muted/20 p-1">
                  <TabsTrigger value="diff" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <GitBranch className="h-4 w-4" />
                    差异
                  </TabsTrigger>
                  <TabsTrigger value="db-vs-db" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <ArrowRightLeft className="h-4 w-4" />
                    库对库
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <History className="h-4 w-4" />
                    历史
                  </TabsTrigger>
                  <TabsTrigger value="snapshot-compare" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <ArrowRightLeft className="h-4 w-4" />
                    快照对比
                  </TabsTrigger>
                  <TabsTrigger value="live-export" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <FileSpreadsheet className="h-4 w-4" />
                    导出 XLSX
                  </TabsTrigger>
                  <TabsTrigger value="apply" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    执行变更
                  </TabsTrigger>
                  <TabsTrigger value="graph" className="gap-2 rounded-sm px-3 py-1.5 text-[11px] font-medium">
                    <Network className="h-4 w-4" />
                    关系图
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="diff" className="mt-0 p-4">
              <DbDiffWorkspace
                selectedConnection={selectedConnection}
                selectedFileId={selectedFileId}
                selectedFileName={selectedFileName}
                selectedSheet={selectedSheet}
                onStateChange={setDiffState}
              />
            </TabsContent>

            <TabsContent value="db-vs-db" className="mt-0 p-4">
              <DbVsDbWorkspace seedConnection={selectedConnection} />
            </TabsContent>

            <TabsContent value="history" className="mt-0 p-4">
              <DbHistoryPanel
                selectedConnection={selectedConnection}
                selectedFileId={selectedFileId}
                selectedFileName={selectedFileName}
                selectedSheet={selectedSheet}
                onOpenSnapshotCompare={(seed) => {
                  setSnapshotCompareSeed(seed);
                  setActiveView("snapshot-compare");
                }}
              />
            </TabsContent>

            <TabsContent value="snapshot-compare" className="mt-0 p-4">
              <DbSnapshotCompareWorkspace
                seedConnection={selectedConnection}
                initialSeed={snapshotCompareSeed}
              />
            </TabsContent>

            <TabsContent value="live-export" className="mt-0 p-4">
              <DbLiveExportWorkspace
                selectedConnection={selectedConnection}
                onActivateFile={onActivateFile}
              />
            </TabsContent>

            <TabsContent value="apply" className="mt-0 p-4">
              <DbApplyPanel
                selectedConnection={selectedConnection}
                selectedFileId={selectedFileId}
                selectedFileName={selectedFileName}
                selectedSheet={selectedSheet}
                diffState={diffState}
              />
            </TabsContent>

            <TabsContent value="graph" className="mt-0 p-4">
              <DbSchemaGraph
                selectedConnection={selectedConnection}
                selectedFileId={selectedFileId}
                selectedFileName={selectedFileName}
                selectedSheet={selectedSheet}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
