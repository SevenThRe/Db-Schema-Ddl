import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRightLeft, FileSpreadsheet, GitBranch, History, Network, ShieldCheck } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DbConnectionImportDraft, DbConnectionUpsertRequest } from "@shared/schema";
import type { DbManagementViewMode } from "@shared/schema";

interface DbManagementWorkspaceProps {
  onBack: () => void;
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
    title: "Definition vs Live Schema",
    description: "先看差异，再决定 rename、预览 SQL 或进入 apply 阶段。",
  },
  "db-vs-db": {
    title: "DB vs DB",
    description: "对比两个真实 database 的结构演进，适合环境核对与迁移前检查。",
  },
  "snapshot-compare": {
    title: "Snapshot Compare",
    description: "围绕历史 snapshot 做回溯与横向比较，确认 schema 变化轨迹。",
  },
  "live-export": {
    title: "Live Export",
    description: "把 live database 导回 XLSX，回到工作簿驱动的主链路。",
  },
  history: {
    title: "History",
    description: "查看过去的 snapshot 与比较记录，恢复你的操作上下文。",
  },
  apply: {
    title: "Apply",
    description: "在真正执行前确认风险、上下文与差异来源，降低误操作概率。",
  },
  graph: {
    title: "Schema Graph",
    description: "用关系视图理解表之间的结构关联，而不是在列表里盲找。",
  },
};

function readStoredViewMode(): DbManagementViewMode {
  if (typeof window === "undefined") {
    return "diff";
  }
  const stored = window.localStorage.getItem(DB_MANAGEMENT_ACTIVE_VIEW_STORAGE_KEY);
  return VIEW_MODES.includes(stored as DbManagementViewMode) ? (stored as DbManagementViewMode) : "diff";
}

export function DbManagementWorkspace({ onBack, onActivateFile, selectedFileId, selectedSheet, selectedFileName }: DbManagementWorkspaceProps) {
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
  const selectedDatabaseLabel = selectedConnection?.lastSelectedDatabase ?? "未选择 database";
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
    <div className="flex h-full flex-col overflow-auto bg-[linear-gradient(180deg,hsl(var(--panel-muted)/0.6),transparent_36%)] p-5">
      <section className="mb-5 overflow-hidden rounded-[28px] border border-[hsl(var(--workspace-ink))/0.08] bg-[linear-gradient(135deg,hsl(var(--workspace-ink)),hsl(var(--workspace-ink-soft)))] px-5 py-5 text-white shadow-[0_28px_80px_-36px_hsl(var(--workspace-shadow)/0.65)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/55">DB Control Center</p>
            <h2 className="mt-3 text-[clamp(1.5rem,2.6vw,2.5rem)] font-semibold leading-tight">
              把连接、快照、差异与执行放回一条清晰的数据库工作流里
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
              当前 DB 管理模块不再只是功能堆叠，而是围绕“连接上下文、目标 database、活动工作簿、当前操作模式”展开的专业操作台。
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onBack}
            className="h-10 rounded-full border-white/20 bg-white/6 px-4 text-white hover:bg-white/12 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回定义书
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">Connection</p>
            <p className="mt-2 truncate text-sm font-medium">{connectionLabel}</p>
            <p className="mt-1 text-xs text-white/55">连接是所有 schema 读取、差异分析与 apply 流程的起点。</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">Database</p>
            <p className="mt-2 truncate text-sm font-medium">{selectedDatabaseLabel}</p>
            <p className="mt-1 text-xs text-white/55">任何 snapshot、graph、history 与 live export 都应显式绑定当前 database。</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">Workbook Context</p>
            <p className="mt-2 truncate text-sm font-medium">{workbookLabel}</p>
            <p className="mt-1 text-xs text-white/55">让 DB 操作和 Excel 定义书保持同一个上下文，不再来回失焦。</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.22fr_0.78fr]">
        <div className="panel-surface-muted p-1.5">
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
        </div>

        <div className="panel-surface-muted p-1.5">
          <Card className="border-white/70 bg-white/86 shadow-none">
            <CardHeader className="space-y-3">
              <div>
                <p className="section-kicker">Context & Introspection</p>
                <CardTitle className="mt-2 text-xl text-[hsl(var(--workspace-ink))]">操作上下文</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6">
                  先明确当前连接和 database，再决定要读取快照、查看差异，还是把 live schema 回写到工作簿。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-[hsl(var(--panel-muted)/0.85)] px-4 py-3">
                  <p className="section-kicker">Selected View</p>
                  <p className="mt-2 text-sm font-semibold text-[hsl(var(--workspace-ink))]">{activeViewMeta.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeViewMeta.description}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-[hsl(var(--panel-muted)/0.85)] px-4 py-3">
                  <p className="section-kicker">Snapshot Status</p>
                  <p className="mt-2 text-sm font-semibold text-[hsl(var(--workspace-ink))]">
                    {latestResult ? `${latestResult.snapshot.tableCount} 张表已载入` : "尚未读取最新 snapshot"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {latestResult
                      ? `当前快照来自 ${latestResult.selectedDatabase}。`
                      : "选择 database 后触发 introspection，建立后续差异与历史的基础。"}
                  </p>
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
      </div>

      <div className="mt-4 panel-surface-muted p-4">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as DbManagementViewMode)} className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="section-kicker">Workspace Modes</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[hsl(var(--workspace-ink))]">
                {activeViewMeta.title}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {activeViewMeta.description} 初次进入默认打开差异视图，之后会记住你上次停留的位置。
              </p>
            </div>
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-[20px] border border-white/80 bg-white/82 p-1 shadow-sm">
              <TabsTrigger value="diff" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <GitBranch className="h-4 w-4" />
                差异
              </TabsTrigger>
              <TabsTrigger value="db-vs-db" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <ArrowRightLeft className="h-4 w-4" />
                DB vs DB
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <History className="h-4 w-4" />
                历史
              </TabsTrigger>
              <TabsTrigger value="snapshot-compare" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <ArrowRightLeft className="h-4 w-4" />
                Snapshot Compare
              </TabsTrigger>
              <TabsTrigger value="live-export" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <FileSpreadsheet className="h-4 w-4" />
                Live DB to XLSX
              </TabsTrigger>
              <TabsTrigger value="apply" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
                <ShieldCheck className="h-4 w-4" />
                Apply
              </TabsTrigger>
              <TabsTrigger value="graph" className="gap-2 rounded-2xl px-3 py-2 text-[11px] font-medium">
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
              onOpenSnapshotCompare={(seed) => {
                setSnapshotCompareSeed(seed);
                setActiveView("snapshot-compare");
              }}
            />
          </TabsContent>

          <TabsContent value="snapshot-compare" className="mt-0">
            <DbSnapshotCompareWorkspace
              seedConnection={selectedConnection}
              initialSeed={snapshotCompareSeed}
            />
          </TabsContent>

          <TabsContent value="live-export" className="mt-0">
            <DbLiveExportWorkspace
              selectedConnection={selectedConnection}
              onActivateFile={onActivateFile}
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
