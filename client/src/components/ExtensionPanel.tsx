// 拡張機能管理パネル
//
// Sidebar フッターの「拡張機能」ボタンから Sheet として開く。
// 「内蔵拡張」タブ: Rust バックエンドが提供する内蔵拡張の一覧と各ワークスペース
// 「インストール済み」タブ: 外部プラグインのインストール/起動/停止管理

import { useState } from "react";
import {
  Puzzle,
  Download,
  Trash2,
  Play,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Zap,
  Database,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useExtensions, type InstalledExtension, type ExtensionCatalog } from "@/hooks/use-extensions";
import { useBuiltinExtensions } from "@/hooks/use-ddl";
import { EnumGenWorkspace } from "@/components/extensions/EnumGenWorkspace";
import { DdlToExcelWorkspace } from "@/components/extensions/DdlToExcelWorkspace";
import { DbConnectorWorkspace } from "@/components/extensions/DbConnectorWorkspace";
import { cn } from "@/lib/utils";
import type { BuiltinExtensionManifest } from "@shared/schema";
import { useFiles } from "@/hooks/use-ddl";

// ──────────────────────────────────────────────
// 既知の外部拡張（GitHub から取得できる一覧）
// ──────────────────────────────────────────────

const OFFICIAL_EXTENSIONS: { id: string; name: string; description: string }[] = [
  {
    id: "db-management",
    name: "DB 接続管理",
    description: "MySQL / PostgreSQL に接続し、スキーマを直接比較・適用する",
  },
];

// ──────────────────────────────────────────────
// 内蔵拡張カテゴリのアイコン選択
// ──────────────────────────────────────────────

function ExtCategoryIcon({ category }: { category: BuiltinExtensionManifest["category"] }) {
  if (category === "DbConnector") {
    return <Database className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
  }
  return <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
}

// ──────────────────────────────────────────────
// 内蔵拡張ワークスペースの ID → コンポーネントマップ
// 現在は enum-gen のみ対応。今後はここに追加する。
// ──────────────────────────────────────────────

const ENUM_GEN_IDS = new Set(["enum-gen", "excel-enum-java", "excel-enum-typescript", "excel-to-java-enum", "excel-to-ts-enum"]);
const DDL_TO_EXCEL_IDS = new Set(["ddl-to-excel"]);
const DB_CONNECTOR_IDS = new Set(["db-connector"]);

// ──────────────────────────────────────────────
// Props 型
// ──────────────────────────────────────────────

interface ExtensionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 現在選択中のファイル ID（内蔵拡張ワークスペースに引き渡す） */
  selectedFileId?: number | null;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function ExtensionPanel({ open, onOpenChange, selectedFileId }: ExtensionPanelProps) {
  const { toast } = useToast();
  const { extensions, isLoading: isExtListLoading, install, isInstalling, uninstall, isUninstalling, start, stop, fetchCatalog } =
    useExtensions();

  // 内蔵拡張一覧
  const { data: builtinList = [], isLoading: isBuiltinLoading } = useBuiltinExtensions();

  // ファイル一覧（ワークスペース用）
  const { data: files = [] } = useFiles();

  // 開いているワークスペース（内蔵拡張 ID）
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const [catalogMap, setCatalogMap] = useState<Record<string, ExtensionCatalog | null>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const installedMap = new Map<string, InstalledExtension>(
    extensions.map((e) => [e.manifest.id, e]),
  );

  // ── 現在選択ファイル情報 ──────────────────────

  const currentFile = selectedFileId != null
    ? files.find((f) => f.id === selectedFileId) ?? null
    : null;

  // ── 外部拡張アクション ──────────────────────

  const handleInstall = async (id: string) => {
    setActiveId(id);
    try {
      await install(id);
      toast({ title: "インストール完了", variant: "success" });
    } catch (e) {
      toast({ title: "インストール失敗", description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleUninstall = async (id: string) => {
    setActiveId(id);
    try {
      await uninstall(id);
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: "アンインストール完了", variant: "success" });
    } catch (e) {
      toast({ title: "アンインストール失敗", description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleStart = async (id: string) => {
    setActiveId(id);
    try {
      await start(id);
      setRunningIds((prev) => { const s = new Set(prev); s.add(id); return s; });
      toast({ title: "起動しました", variant: "success" });
    } catch (e) {
      toast({ title: "起動失敗", description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleStop = async (id: string) => {
    setActiveId(id);
    try {
      await stop(id);
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: "停止しました", variant: "success" });
    } catch (e) {
      toast({ title: "停止失敗", description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleCheckUpdate = async (id: string, installedVersion?: string) => {
    setCheckingId(id);
    try {
      const catalog = await fetchCatalog(id, installedVersion);
      setCatalogMap((prev) => ({ ...prev, [id]: catalog }));
    } catch {
      setCatalogMap((prev) => ({ ...prev, [id]: null }));
      toast({ title: "バージョン確認失敗", description: "GitHub に接続できませんでした", variant: "destructive" });
    } finally {
      setCheckingId(null);
    }
  };

  const isBusy = (id: string) => activeId === id;

  // ── ワークスペース表示判定 ──────────────────

  const showEnumGen =
    activeWorkspaceId !== null &&
    ENUM_GEN_IDS.has(activeWorkspaceId) &&
    currentFile != null;

  const showDdlToExcel =
    activeWorkspaceId !== null &&
    DDL_TO_EXCEL_IDS.has(activeWorkspaceId);

  const showDbConnector =
    activeWorkspaceId !== null &&
    DB_CONNECTOR_IDS.has(activeWorkspaceId);

  // ── レンダリング ────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      // パネルを閉じるときはワークスペースもリセット
      if (!nextOpen) setActiveWorkspaceId(null);
      onOpenChange(nextOpen);
    }}>
      <SheetContent side="left" className="flex w-[min(92vw,520px)] flex-col p-0 sm:max-w-[520px]">
        {/* ── ヘッダー ── */}
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            {activeWorkspaceId ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md"
                onClick={() => setActiveWorkspaceId(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Puzzle className="h-4 w-4" />
            )}
            {activeWorkspaceId
              ? builtinList.find((b) => b.id === activeWorkspaceId)?.name ?? "拡張機能"
              : "拡張機能"}
          </SheetTitle>
        </SheetHeader>

        {/* ── ワークスペース表示（内蔵拡張） ── */}
        {showDbConnector ? (
          <div className="flex-1 overflow-hidden">
            <DbConnectorWorkspace />
          </div>
        ) : showDdlToExcel ? (
          <div className="flex-1 overflow-hidden">
            <DdlToExcelWorkspace />
          </div>
        ) : showEnumGen ? (
          <div className="flex-1 overflow-hidden">
            <EnumGenWorkspace fileId={currentFile!.id} fileName={currentFile!.originalName} />
          </div>
        ) : activeWorkspaceId !== null && currentFile === null ? (
          // ファイル未選択の警告
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">请先在左侧文件列表选择一个 Excel 文件</p>
            <Button variant="outline" size="sm" onClick={() => setActiveWorkspaceId(null)}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              返回
            </Button>
          </div>
        ) : (
          // ── タブ一覧ビュー ──
          <Tabs defaultValue="builtin" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 mb-0 h-8 w-auto justify-start rounded-md border border-border bg-muted/20 p-1">
              <TabsTrigger value="builtin" className="h-6 rounded-md px-3 text-xs">
                内蔵拡張
              </TabsTrigger>
              <TabsTrigger value="installed" className="h-6 rounded-md px-3 text-xs">
                インストール済み
              </TabsTrigger>
            </TabsList>

            {/* ── 内蔵拡張タブ ── */}
            <TabsContent value="builtin" className="flex-1 overflow-hidden mt-0 pt-3">
              <ScrollArea className="h-full">
                <div className="space-y-2 px-4 pb-4">
                  {isBuiltinLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : builtinList.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      暂无内蔵拡張
                    </div>
                  ) : (
                    <>
                      {/* カテゴリ: Transformer */}
                      {builtinList.some((b) => b.category === "Transformer") ? (
                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            变换器
                          </p>
                          <div className="space-y-2">
                            {builtinList
                              .filter((b) => b.category === "Transformer")
                              .map((ext) => (
                                <BuiltinExtCard
                                  key={ext.id}
                                  ext={ext}
                                  onOpen={() => setActiveWorkspaceId(ext.id)}
                                />
                              ))}
                          </div>
                        </div>
                      ) : null}

                      {/* カテゴリ: DbConnector */}
                      {builtinList.some((b) => b.category === "DbConnector") ? (
                        <div>
                          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            数据库连接器
                          </p>
                          <div className="space-y-2">
                            {builtinList
                              .filter((b) => b.category === "DbConnector")
                              .map((ext) => (
                                <BuiltinExtCard
                                  key={ext.id}
                                  ext={ext}
                                  onOpen={() => setActiveWorkspaceId(ext.id)}
                                />
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ── インストール済み外部拡張タブ ── */}
            <TabsContent value="installed" className="flex-1 overflow-hidden mt-0 pt-3">
              <ScrollArea className="h-full">
                <div className="divide-y divide-border pb-4">
                  {isExtListLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    OFFICIAL_EXTENSIONS.map((ext) => {
                      const installed = installedMap.get(ext.id);
                      const running = runningIds.has(ext.id);
                      const catalog = catalogMap[ext.id];
                      const busy = isBusy(ext.id);
                      const checking = checkingId === ext.id;

                      return (
                        <div key={ext.id} className="px-4 py-3 space-y-2">
                          {/* ヘッダー行 */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{ext.name}</p>
                                {installed ? (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500/50 text-green-600 dark:text-green-400">
                                    v{installed.manifest.version}
                                  </Badge>
                                ) : null}
                                {running ? (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-500/50 text-blue-600 dark:text-blue-400">
                                    実行中
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                                {ext.description}
                              </p>
                            </div>
                          </div>

                          {/* カタログ情報 */}
                          {catalog !== undefined && (
                            <div className={cn(
                              "rounded-md border px-3 py-2 text-xs",
                              catalog === null
                                ? "border-destructive/40 bg-destructive/5 text-destructive"
                                : "border-border bg-muted/20",
                            )}>
                              {catalog === null ? (
                                <span className="flex items-center gap-1.5">
                                  <AlertCircle className="h-3 w-3" />
                                  取得失敗
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    {catalog.update_available ? (
                                      <AlertCircle className="h-3 w-3 text-amber-500" />
                                    ) : (
                                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    )}
                                    <span className="font-medium">
                                      最新: v{catalog.latest_version}
                                      {catalog.update_available ? " — アップデートあり" : " — 最新です"}
                                    </span>
                                  </div>
                                  {catalog.release_notes ? (
                                    <p className="text-muted-foreground line-clamp-2">{catalog.release_notes}</p>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )}

                          {/* アクションボタン */}
                          <div className="flex flex-wrap gap-1.5">
                            {!installed ? (
                              <Button
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => handleInstall(ext.id)}
                                disabled={busy || isInstalling}
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                インストール
                              </Button>
                            ) : (
                              <>
                                {running ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => handleStop(ext.id)}
                                    disabled={busy}
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                    停止
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => handleStart(ext.id)}
                                    disabled={busy}
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                    起動
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleCheckUpdate(ext.id, installed.manifest.version)}
                                  disabled={checking || busy}
                                >
                                  {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  更新確認
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => handleUninstall(ext.id)}
                                  disabled={busy || isUninstalling}
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  削除
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ──────────────────────────────────────────────
// 内蔵拡張カード（一覧表示用サブコンポーネント）
// ──────────────────────────────────────────────

interface BuiltinExtCardProps {
  ext: BuiltinExtensionManifest;
  onOpen: () => void;
}

function BuiltinExtCard({ ext, onOpen }: BuiltinExtCardProps) {
  return (
    <Card className="overflow-hidden transition-colors hover:bg-muted/10">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <ExtCategoryIcon category={ext.category} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-xs font-medium text-foreground">{ext.name}</p>
                {/* 入出力フォーマットバッジ */}
                <span className="text-[10px] text-muted-foreground">
                  {ext.inputFormats.join(", ")} → {ext.outputFormats.join(", ")}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {ext.description}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={onOpen}
          >
            打开
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
