import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRightLeft, GitBranch, History, Network, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY,
  useCreateDbConnection,
  useDbConnections,
  useDbDatabases,
  useDeleteDbConnection,
  useIntrospectDbSchema,
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
import { DbSchemaGraph } from "./DbSchemaGraph";
import { DbVsDbWorkspace } from "./DbVsDbWorkspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DbConnectionUpsertRequest } from "@shared/schema";
import type { DbManagementViewMode } from "@shared/schema";

interface DbManagementWorkspaceProps {
  onBack: () => void;
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

const VIEW_MODES: readonly DbManagementViewMode[] = ["diff", "db-vs-db", "history", "apply", "graph"];

function readStoredViewMode(): DbManagementViewMode {
  if (typeof window === "undefined") {
    return "diff";
  }
  const stored = window.localStorage.getItem(DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY);
  return VIEW_MODES.includes(stored as DbManagementViewMode) ? (stored as DbManagementViewMode) : "diff";
}

export function DbManagementWorkspace({ onBack, selectedFileId, selectedSheet, selectedFileName }: DbManagementWorkspaceProps) {
  const { toast } = useToast();
  const { data: connections = [] } = useDbConnections();
  const createConnection = useCreateDbConnection();
  const updateConnection = useUpdateDbConnection();
  const deleteConnection = useDeleteDbConnection();
  const testConnection = useTestDbConnection();
  const selectDatabase = useSelectDbDatabase();
  const introspectSchema = useIntrospectDbSchema();
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<DbManagementViewMode>(() => readStoredViewMode());
  const [diffState, setDiffState] = useState<DbDiffWorkspaceStateSnapshot>(DEFAULT_DIFF_STATE);

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );
  const { data: databases = [], isLoading: isDatabasesLoading } = useDbDatabases(selectedConnectionId);

  const latestResult =
    introspectSchema.data && introspectSchema.data.connection.id === selectedConnectionId
      ? introspectSchema.data
      : null;

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
        description: error instanceof Error ? error.message : "切换 database 失败。",
        variant: "destructive",
      });
    }
  };

  const handleIntrospect = async () => {
    if (!selectedConnection?.lastSelectedDatabase) {
      toast({
        title: "DB 管理",
        description: "请先选择一个 database。",
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
        title: "Schema 读取完成",
        description: `${result.selectedDatabase} 已生成 ${result.snapshot.tableCount} 张表的 snapshot。`,
      });
    } catch (error) {
      toast({
        title: "Schema 读取失败",
        description: error instanceof Error ? error.message : "读取 schema 失败。",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">DB 管理</h2>
          <p className="text-sm text-muted-foreground">
            在这里保存 MySQL 连接、切换 database，并读取既存 schema 的 canonical snapshot。
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回定义书
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <ConnectionManager
          connections={connections}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={(connectionId) => setSelectedConnectionId(connectionId > 0 ? connectionId : null)}
          onSave={handleSaveConnection}
          onDelete={handleDeleteConnection}
          onTest={handleTestConnection}
          isSaving={createConnection.isPending || updateConnection.isPending}
          isDeleting={deleteConnection.isPending}
          isTesting={testConnection.isPending}
        />

        <Card className="border-border/70">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">当前上下文</CardTitle>
            <CardDescription>
              这里管理 MySQL 连接与 schema snapshot；下方工作区用于 file-vs-live-DB diff、rename review 和 SQL preview。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

      <div className="mt-4">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as DbManagementViewMode)} className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight">DB 工作区</h3>
              <p className="text-sm text-muted-foreground">
                初期默认落在差异列表；之后会记住你上次停留的视图。
              </p>
            </div>
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="diff" className="gap-2 rounded-lg px-3 py-2">
                <GitBranch className="h-4 w-4" />
                差异
              </TabsTrigger>
              <TabsTrigger value="db-vs-db" className="gap-2 rounded-lg px-3 py-2">
                <ArrowRightLeft className="h-4 w-4" />
                DB vs DB
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 rounded-lg px-3 py-2">
                <History className="h-4 w-4" />
                历史
              </TabsTrigger>
              <TabsTrigger value="apply" className="gap-2 rounded-lg px-3 py-2">
                <ShieldCheck className="h-4 w-4" />
                Apply
              </TabsTrigger>
              <TabsTrigger value="graph" className="gap-2 rounded-lg px-3 py-2">
                <Network className="h-4 w-4" />
                关系图
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="diff" className="mt-0">
            <DbDiffWorkspace
              selectedConnection={selectedConnection}
              selectedFileId={selectedFileId}
              selectedFileName={selectedFileName}
              selectedSheet={selectedSheet}
              onStateChange={setDiffState}
            />
          </TabsContent>

          <TabsContent value="db-vs-db" className="mt-0">
            <DbVsDbWorkspace seedConnection={selectedConnection} />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <DbHistoryPanel
              selectedConnection={selectedConnection}
              selectedFileId={selectedFileId}
              selectedFileName={selectedFileName}
              selectedSheet={selectedSheet}
            />
          </TabsContent>

          <TabsContent value="apply" className="mt-0">
            <DbApplyPanel
              selectedConnection={selectedConnection}
              selectedFileId={selectedFileId}
              selectedFileName={selectedFileName}
              selectedSheet={selectedSheet}
              diffState={diffState}
            />
          </TabsContent>

          <TabsContent value="graph" className="mt-0">
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
  );
}
