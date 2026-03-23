// 拡張機能管理パネル（Extension Center）
//
// Sidebar フッターの「拡張機能」ボタンから Sheet として開く。
// V2: ワークスペースのレンダリングは ExtensionWorkspaceHost に移管。
// このパネルは拡張の一覧表示・管理のみを担当する。

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useExtensions, type InstalledExtension, type ExtensionCatalog } from "@/hooks/use-extensions";
import { useExtensionHost } from "@/extensions/host-context";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// 既知の外部拡張（GitHub から取得できる一覧）
// ──────────────────────────────────────────────

const OFFICIAL_EXTENSION_IDS: readonly string[] = [];

// ──────────────────────────────────────────────
// カテゴリアイコン
// ──────────────────────────────────────────────

function ExtCategoryIcon({ category }: { category: string }) {
  if (category === "DbConnector") {
    return <Database className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
  }
  return <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
}

// ──────────────────────────────────────────────
// Props 型
// ──────────────────────────────────────────────

interface ExtensionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFileId?: number | null;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function ExtensionPanel({ open, onOpenChange }: ExtensionPanelProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { extensions: extList, isLoading: isExtListLoading, install, isInstalling, uninstall, isUninstalling, start, stop, fetchCatalog } =
    useExtensions();

  // V2: 統合拡張リストから builtin のみ抽出
  const { extensions: allExtensions, isLoading: isAllLoading } = useExtensionHost();
  const builtinExtensions = allExtensions.filter((e) => e.manifest.kind === "builtin");

  const [catalogMap, setCatalogMap] = useState<Record<string, ExtensionCatalog | null>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const installedMap = new Map<string, InstalledExtension>(
    extList.map((e) => [e.manifest.id, e]),
  );

  // ── 外部拡張アクション ──────────────────────

  const handleInstall = async (id: string) => {
    setActiveId(id);
    try {
      await install(id);
      toast({ title: t("extensions.toast.installSuccess"), variant: "success" });
    } catch (e) {
      toast({ title: t("extensions.toast.installFailed"), description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleUninstall = async (id: string) => {
    setActiveId(id);
    try {
      await uninstall(id);
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: t("extensions.toast.uninstallSuccess"), variant: "success" });
    } catch (e) {
      toast({ title: t("extensions.toast.uninstallFailed"), description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleStart = async (id: string) => {
    setActiveId(id);
    try {
      await start(id);
      setRunningIds((prev) => { const s = new Set(prev); s.add(id); return s; });
      toast({ title: t("extensions.toast.startSuccess"), variant: "success" });
    } catch (e) {
      toast({ title: t("extensions.toast.startFailed"), description: String(e), variant: "destructive" });
    } finally {
      setActiveId(null);
    }
  };

  const handleStop = async (id: string) => {
    setActiveId(id);
    try {
      await stop(id);
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: t("extensions.toast.stopSuccess"), variant: "success" });
    } catch (e) {
      toast({ title: t("extensions.toast.stopFailed"), description: String(e), variant: "destructive" });
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
      toast({ title: t("extensions.toast.checkUpdateFailed"), description: t("extensions.toast.githubConnectFailed"), variant: "destructive" });
    } finally {
      setCheckingId(null);
    }
  };

  const isBusy = (id: string) => activeId === id;

  // ── レンダリング ────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[min(92vw,520px)] flex-col p-0 sm:max-w-[520px]">
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Puzzle className="h-4 w-4" />
            {t("extensions.title")}
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="builtin" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 mb-0 h-8 w-auto justify-start rounded-md border border-border bg-muted/20 p-1">
            <TabsTrigger value="builtin" className="h-6 rounded-md px-3 text-xs">
              {t("extensions.builtinTab")}
            </TabsTrigger>
            <TabsTrigger value="installed" className="h-6 rounded-md px-3 text-xs">
              {t("extensions.installedTab")}
            </TabsTrigger>
          </TabsList>

          {/* ── 内蔵拡張タブ（V2: useExtensionHost から取得） ── */}
          <TabsContent value="builtin" className="flex-1 overflow-hidden mt-0 pt-3">
            <ScrollArea className="h-full">
              <div className="space-y-2 px-4 pb-4">
                {isAllLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : builtinExtensions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t("extensions.noBuiltin")}
                  </div>
                ) : (
                  builtinExtensions.map((ext) => (
                    <Card key={ext.manifest.id} className="overflow-hidden transition-colors hover:bg-muted/10">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <ExtCategoryIcon category={ext.manifest.category} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-xs font-medium text-foreground">{ext.manifest.name}</p>
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  v{ext.manifest.version}
                                </Badge>
                                {ext.enabled ? (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500/50 text-green-600 dark:text-green-400">
                                    有効
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                {ext.manifest.description}
                              </p>
                            </div>
                          </div>
                          {/* 有効/無効トグル — ext_set_enabled を呼び出してキャッシュを更新 */}
                          <Switch
                            checked={ext.enabled}
                            onCheckedChange={async (checked) => {
                              const { invoke } = await import("@tauri-apps/api/core");
                              await invoke("ext_set_enabled", { id: ext.manifest.id, enabled: checked });
                              queryClient.invalidateQueries({ queryKey: ["extensions", "all"] });
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
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
                  OFFICIAL_EXTENSION_IDS.map((extId) => {
                    const camelKey = extId.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
                    const extName = t(`extensions.officialExtensions.${camelKey}.name`, { defaultValue: extId });
                    const extDesc = t(`extensions.officialExtensions.${camelKey}.description`, { defaultValue: "" });
                    const installed = installedMap.get(extId);
                    const running = runningIds.has(extId);
                    const catalog = catalogMap[extId];
                    const busy = isBusy(extId);
                    const checking = checkingId === extId;

                    return (
                      <div key={extId} className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{extName}</p>
                              {installed ? (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500/50 text-green-600 dark:text-green-400">
                                  v{installed.manifest.version}
                                </Badge>
                              ) : null}
                              {running ? (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-500/50 text-blue-600 dark:text-blue-400">
                                  {t("extensions.badge.running")}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                              {extDesc}
                            </p>
                          </div>
                        </div>

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
                                {t("extensions.catalog.fetchFailed")}
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
                                    {t("extensions.catalog.latest", { version: catalog.latest_version })}
                                    {catalog.update_available ? t("extensions.catalog.updateAvailable") : t("extensions.catalog.upToDate")}
                                  </span>
                                </div>
                                {catalog.release_notes ? (
                                  <p className="text-muted-foreground line-clamp-2">{catalog.release_notes}</p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {!installed ? (
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => handleInstall(extId)}
                              disabled={busy || isInstalling}
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                              {t("extensions.button.install")}
                            </Button>
                          ) : (
                            <>
                              {running ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1.5 text-xs"
                                  onClick={() => handleStop(extId)}
                                  disabled={busy}
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                  {t("extensions.button.stop")}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1.5 text-xs"
                                  onClick={() => handleStart(extId)}
                                  disabled={busy}
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                  {t("extensions.button.start")}
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleCheckUpdate(extId, installed.manifest.version)}
                                disabled={checking || busy}
                              >
                                {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                {t("extensions.button.checkUpdate")}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleUninstall(extId)}
                                disabled={busy || isUninstalling}
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                {t("extensions.button.uninstall")}
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
      </SheetContent>
    </Sheet>
  );
}
