// 拡張機能管理パネル
//
// Sidebar フッターの「拡張」ボタンから Sheet として開く。
// インストール済み拡張の一覧表示 + インストール/アンインストール/起動/停止。

import { useState } from "react";
import { Puzzle, Download, Trash2, Play, Square, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useExtensions, type InstalledExtension, type ExtensionCatalog } from "@/hooks/use-extensions";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// 既知の公式拡張（GitHub から取得できる一覧）
// ──────────────────────────────────────────────

const OFFICIAL_EXTENSIONS: { id: string; name: string; description: string }[] = [
  {
    id: "db-management",
    name: "DB 接続管理",
    description: "MySQL / PostgreSQL に接続し、スキーマを直接比較・適用する",
  },
];

// ──────────────────────────────────────────────
// ExtensionPanel
// ──────────────────────────────────────────────

interface ExtensionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExtensionPanel({ open, onOpenChange }: ExtensionPanelProps) {
  const { toast } = useToast();
  const { extensions, isLoading, install, isInstalling, uninstall, isUninstalling, start, stop, fetchCatalog } =
    useExtensions();

  const [catalogMap, setCatalogMap] = useState<Record<string, ExtensionCatalog | null>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const installedMap = new Map<string, InstalledExtension>(
    extensions.map((e) => [e.manifest.id, e]),
  );

  // ── アクション ──────────────────────────────

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

  // ── レンダリング ────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[min(92vw,380px)] flex-col p-0 sm:max-w-[380px]">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Puzzle className="h-4 w-4" />
            拡張機能
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {OFFICIAL_EXTENSIONS.map((ext) => {
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
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
