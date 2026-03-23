// 拡張機能管理パネル（Extension Center）
//
// Sidebar フッターの「拡張機能」ボタンから中央パネルとして開く。
// V2: ワークスペースのレンダリングは ExtensionWorkspaceHost に移管。
// このパネルは拡張の一覧表示・管理のみを担当する。

import { useState } from "react";
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
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useExtensions, type InstalledExtension, type ExtensionCatalog } from "@/hooks/use-extensions";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// 既知の外部拡張（GitHub から取得できる一覧）
// ──────────────────────────────────────────────

const OFFICIAL_EXTENSION_IDS: readonly string[] = [];

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
  const { extensions: extList, isLoading: isExtListLoading, install, isInstalling, uninstall, isUninstalling, start, stop, fetchCatalog } =
    useExtensions();

  const installedExternalCount = extList.length;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,760px)] w-[min(92vw,880px)] max-w-5xl flex-col overflow-hidden bg-background p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Puzzle className="h-4 w-4" />
            {t("extensions.panelTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("extensions.center.title")}</p>
              <p className="mt-1 max-w-[56ch] text-xs leading-5 text-muted-foreground">
                {t("extensions.center.description")}
              </p>
            </div>
            <div className="min-w-[120px] rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-right dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("extensions.center.installedLabel")}
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{installedExternalCount}</div>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-5 pb-5 pt-4">
            {isExtListLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : OFFICIAL_EXTENSION_IDS.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/30">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
                  <Puzzle className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">{t("extensions.center.emptyTitle")}</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                  {t("extensions.center.emptyDescription")}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                {OFFICIAL_EXTENSION_IDS.map((extId, index) => {
                  const camelKey = extId.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
                  const extName = t(`extensions.officialExtensions.${camelKey}.name`, { defaultValue: extId });
                  const extDesc = t(`extensions.officialExtensions.${camelKey}.description`, { defaultValue: "" });
                  const installed = installedMap.get(extId);
                  const running = runningIds.has(extId);
                  const catalog = catalogMap[extId];
                  const busy = isBusy(extId);
                  const checking = checkingId === extId;

                  return (
                    <div
                      key={extId}
                      className={cn(
                        "px-4 py-3",
                        index > 0 ? "border-t border-slate-200 dark:border-slate-800" : "",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{extName}</p>
                            {installed ? (
                              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                v{installed.manifest.version}
                              </span>
                            ) : null}
                            {running ? (
                              <span className="text-[11px] font-medium text-sky-700 dark:text-sky-400">
                                {t("extensions.badge.running")}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{extDesc}</p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {!installed ? (
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 rounded-md px-3 text-xs"
                              onClick={() => handleInstall(extId)}
                              disabled={busy || isInstalling}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              {t("extensions.button.install")}
                            </Button>
                          ) : (
                            <>
                              {running ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 rounded-md px-3 text-xs"
                                  onClick={() => handleStop(extId)}
                                  disabled={busy}
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                                  {t("extensions.button.stop")}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 rounded-md px-3 text-xs"
                                  onClick={() => handleStart(extId)}
                                  disabled={busy}
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                  {t("extensions.button.start")}
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleCheckUpdate(extId, installed.manifest.version)}
                                disabled={checking || busy}
                              >
                                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                {t("extensions.button.checkUpdate")}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 rounded-md px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleUninstall(extId)}
                                disabled={busy || isUninstalling}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                {t("extensions.button.uninstall")}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {catalog !== undefined ? (
                        <div
                          className={cn(
                            "mt-3 rounded-lg border px-3 py-2.5 text-xs",
                            catalog === null
                              ? "border-destructive/40 bg-destructive/5 text-destructive"
                              : "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40",
                          )}
                        >
                          {catalog === null ? (
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {t("extensions.catalog.fetchFailed")}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                {catalog.update_available ? (
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                )}
                                <span className="font-medium text-foreground">
                                  {t("extensions.catalog.latest", { version: catalog.latest_version })}
                                  {catalog.update_available ? t("extensions.catalog.updateAvailable") : t("extensions.catalog.upToDate")}
                                </span>
                              </div>
                              {catalog.release_notes ? (
                                <p className="line-clamp-2 text-muted-foreground">{catalog.release_notes}</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
