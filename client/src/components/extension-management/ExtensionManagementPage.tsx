import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ResolvedExtension } from "@shared/extension-schema";
import { useExtensionHost } from "@/extensions/host-context";
import { useToast } from "@/hooks/use-toast";
import { useExtensions } from "@/hooks/use-extensions";
import type { MainSurface } from "@/extensions/host-api";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  ArrowRightSquare,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  Power,
  PowerOff,
  Puzzle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

const OFFICIAL_EXTENSION_IDS: readonly string[] = ["db-connector"];

const OFFICIAL_EXTENSION_I18N: Record<string, { nameKey: string; descriptionKey: string }> = {
  "db-connector": {
    nameKey: "extensions.officialExtensions.dbConnector.name",
    descriptionKey: "extensions.officialExtensions.dbConnector.description",
  },
};

interface ExtensionManagementPageProps {
  onNavigate?: (surface: MainSurface) => void;
}

type ExtensionStatusKey = "notInstalled" | "installed" | "disabled" | "bundleIssue";

function resolveIcon(iconName?: string): React.ElementType {
  if (!iconName) return Database;
  const icons = LucideIcons as Record<string, unknown>;
  const component = icons[iconName];
  if (typeof component === "function" || (typeof component === "object" && component !== null)) {
    return component as React.ElementType;
  }
  return Database;
}

function buildExtensionSurface(extension: ResolvedExtension): MainSurface | null {
  const activityItem =
    extension.manifest.contributes.activityBar[0] ??
    extension.manifest.contributes.navigation[0];
  const sidebarView =
    extension.manifest.contributes.sidebarViews.find(
      (view) => !activityItem || !view.activityItemId || view.activityItemId === activityItem.id,
    ) ?? extension.manifest.contributes.sidebarViews[0];
  const workbenchView =
    extension.manifest.contributes.workbenchViews.find(
      (view) => !activityItem || !view.activityItemId || view.activityItemId === activityItem.id,
    ) ??
    extension.manifest.contributes.workbenchViews[0] ??
    extension.manifest.contributes.workspacePanels[0];

  if (!activityItem && !workbenchView) {
    return null;
  }

  const defaultWorkbenchViewId =
    activityItem && "defaultWorkbenchViewId" in activityItem
      ? activityItem.defaultWorkbenchViewId
      : undefined;
  const defaultSidebarViewId =
    activityItem && "defaultSidebarViewId" in activityItem
      ? activityItem.defaultSidebarViewId
      : undefined;
  const workbenchViewId =
    defaultWorkbenchViewId ||
    workbenchView?.id;

  return {
    kind: "extension",
    extensionId: extension.manifest.id,
    activityItemId: activityItem?.id,
    sidebarViewId:
      sidebarView?.id ??
      defaultSidebarViewId,
    workbenchViewId,
  };
}

function canOpenExtension(extension: ResolvedExtension): boolean {
  if (!extension.enabled) {
    return false;
  }
  if (extension.uiMount && extension.uiMount.status !== "ready") {
    return false;
  }
  return buildExtensionSurface(extension) !== null;
}

function resolveBundleStatusKey(extension: ResolvedExtension | null): ExtensionStatusKey {
  if (!extension) {
    return "notInstalled";
  }
  if (extension.uiMount && extension.uiMount.status !== "ready") {
    return "bundleIssue";
  }
  if (!extension.enabled) {
    return "disabled";
  }
  return "installed";
}

function getStatusLabel(t: TFunction, statusKey: ExtensionStatusKey): string {
  switch (statusKey) {
    case "notInstalled":
      return t("extensions.status.notInstalled");
    case "installed":
      return t("extensions.status.installed");
    case "disabled":
      return t("extensions.status.disabled");
    case "bundleIssue":
      return t("extensions.status.bundleIssue");
  }
}

function getStatusDescription(t: TFunction, statusKey: ExtensionStatusKey): string {
  switch (statusKey) {
    case "notInstalled":
      return t("extensions.statusDescription.notInstalled");
    case "installed":
      return t("extensions.statusDescription.installed");
    case "disabled":
      return t("extensions.statusDescription.disabled");
    case "bundleIssue":
      return t("extensions.statusDescription.bundleIssue");
  }
}

export function ExtensionManagementPage({ onNavigate }: ExtensionManagementPageProps) {
  const queryClient = useQueryClient();
  const { extensions, isLoading } = useExtensionHost();
  const {
    install,
    isInstalling,
    uninstall,
    isUninstalling,
    setEnabled,
    isSettingEnabled,
    fetchCatalog,
  } = useExtensions();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [uninstallTarget, setUninstallTarget] = useState<{ id: string; name: string } | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [catalogMap, setCatalogMap] = useState<Record<string, Awaited<ReturnType<typeof fetchCatalog>> | null>>({});

  const externalExtensions = extensions.filter((extension) => extension.manifest.kind === "external");
  const installedMap = new Map(externalExtensions.map((extension) => [extension.manifest.id, extension]));
  const unofficialInstalled = externalExtensions.filter(
    (extension) => !OFFICIAL_EXTENSION_IDS.includes(extension.manifest.id),
  );

  const rows = [
    ...OFFICIAL_EXTENSION_IDS.map((id) => {
      const localized = OFFICIAL_EXTENSION_I18N[id];
      const installed = installedMap.get(id) ?? null;
      return {
        id,
        extension: installed,
        name: installed?.manifest.name ?? (localized ? t(localized.nameKey, { defaultValue: id }) : id),
        description:
          installed?.manifest.description ??
          (localized ? t(localized.descriptionKey, { defaultValue: "" }) : ""),
        official: true,
      };
    }),
    ...unofficialInstalled.map((extension) => ({
      id: extension.manifest.id,
      extension,
      name: extension.manifest.name,
      description: extension.manifest.description,
      official: false,
    })),
  ];

  async function refreshResolvedExtensions(): Promise<ResolvedExtension[]> {
    const { invoke } = await import("@tauri-apps/api/core");
    const next = await invoke<ResolvedExtension[]>("ext_list_all");
    queryClient.setQueryData(["extensions", "all"], next);
    return next;
  }

  async function handleInstall(id: string) {
    setActiveAction(`${id}:install`);
    try {
      await install(id);
      const resolvedList = await refreshResolvedExtensions();
      const installed = resolvedList.find((extension) => extension.manifest.id === id) ?? null;
      if (installed && canOpenExtension(installed)) {
        const surface = buildExtensionSurface(installed);
        if (surface) {
          onNavigate?.(surface);
        }
      }
      toast({
        title: t("extensions.toast.installSuccess"),
        description: t("extensions.toast.installReady"),
        variant: "success",
      });
    } catch (err) {
      toast({
        title: t("extensions.toast.installFailed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSetEnabled(id: string, name: string, enabled: boolean) {
    setActiveAction(`${id}:${enabled ? "enable" : "disable"}`);
    try {
      await setEnabled(id, enabled);
      toast({
        title: enabled ? t("extensions.toast.enableSuccess") : t("extensions.toast.disableSuccess"),
        description: name,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: enabled ? t("extensions.toast.enableFailed") : t("extensions.toast.disableFailed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setActiveAction(null);
    }
  }

  function handleOpen(extension: ResolvedExtension) {
    const surface = buildExtensionSurface(extension);
    if (!surface) {
      toast({
        title: t("extensions.toast.openUnavailable"),
        description: extension.manifest.name,
        variant: "destructive",
      });
      return;
    }
    onNavigate?.(surface);
  }

  async function executeUninstall() {
    if (!uninstallTarget) {
      return;
    }
    const { id, name } = uninstallTarget;
    setActiveAction(`${id}:uninstall`);
    try {
      await uninstall(id);
      toast({
        title: t("extensions.toast.uninstallSuccess"),
        description: name,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: t("extensions.toast.uninstallFailed"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setUninstallTarget(null);
      setActiveAction(null);
    }
  }

  async function handleCheckUpdate(id: string, installedVersion?: string) {
    setCheckingId(id);
    try {
      const catalog = await fetchCatalog(id, installedVersion);
      setCatalogMap((previous) => ({ ...previous, [id]: catalog }));
    } catch {
      setCatalogMap((previous) => ({ ...previous, [id]: null }));
      toast({
        title: t("extensions.toast.checkUpdateFailed"),
        description: t("extensions.toast.githubConnectFailed"),
        variant: "destructive",
      });
    } finally {
      setCheckingId(null);
    }
  }

  const installedCount = externalExtensions.length;

  return (
    <>
      <ScrollArea className="h-full w-full">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{t("extensions.managementTitle")}</h1>
              <p className="mt-2 max-w-[64ch] text-xs leading-5 text-muted-foreground">
                {t("extensions.managementDescription")}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-right dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("extensions.center.installedLabel")}
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{installedCount}</div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Puzzle className="h-12 w-12 text-muted-foreground/30" />
                <h3 className="mt-4 text-base font-semibold text-muted-foreground">
                  {t("extensions.center.emptyTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("extensions.center.emptyDescription")}</p>
              </div>
            ) : (
              rows.map((row) => {
                const extension = row.extension;
                const navIcon =
                  extension?.manifest.contributes.activityBar[0]?.icon ??
                  extension?.manifest.contributes.navigation[0]?.icon;
                const IconComponent = resolveIcon(navIcon);
                const stateKey = resolveBundleStatusKey(extension);
                const bundleError =
                  extension?.uiMount && extension.uiMount.status !== "ready"
                    ? extension.uiMount.error
                    : null;
                const busy = activeAction?.startsWith(`${row.id}:`) ?? false;
                const checking = checkingId === row.id;
                const canOpen = extension ? canOpenExtension(extension) : false;
                const catalog = catalogMap[row.id];

                return (
                  <Card key={row.id} className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <IconComponent className="h-5 w-5 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{row.name}</h3>
                          {extension ? (
                            <Badge variant="outline" className="text-xs">
                              v{extension.manifest.version}
                            </Badge>
                          ) : null}
                          {row.official ? (
                            <Badge variant="secondary" className="text-xs">
                              {t("extensions.badge.official")}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              stateKey === "installed" && "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400",
                              stateKey === "disabled" && "border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-400",
                              stateKey === "bundleIssue" && "border-destructive/40 text-destructive",
                            )}
                          >
                            {getStatusLabel(t, stateKey)}
                          </Badge>
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.description || t("extensions.noDescription")}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("extensions.sourceLabel")}: {t("extensions.sourceExternal")}
                        </p>

                        {bundleError ? (
                          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                            <div className="flex items-center gap-1.5 font-medium">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {t("extensions.status.bundleIssue")}
                            </div>
                            <p className="mt-1 leading-5">{bundleError}</p>
                          </div>
                        ) : null}

                        <Separator className="my-3" />

                        <div className="flex flex-wrap gap-1.5">
                          {extension?.manifest.capabilities.length ? (
                            extension.manifest.capabilities.map((capability) => (
                              <Badge key={capability} variant="secondary" className="text-xs">
                                {capability}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("extensions.noCapabilities")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {stateKey === "installed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : stateKey === "disabled" ? (
                          <PowerOff className="h-3.5 w-3.5 text-amber-500" />
                        ) : stateKey === "bundleIssue" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Puzzle className="h-3.5 w-3.5" />
                        )}
                        <span>{getStatusDescription(t, stateKey)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!extension ? (
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 rounded-md px-3 text-xs"
                            disabled={busy || isInstalling}
                            onClick={() => void handleInstall(row.id)}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {t("extensions.button.install")}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 rounded-md px-3 text-xs"
                              disabled={!canOpen}
                              onClick={() => handleOpen(extension)}
                            >
                              <ArrowRightSquare className="h-3.5 w-3.5" />
                              {t("extensions.button.open")}
                            </Button>

                            {extension.enabled ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 rounded-md px-3 text-xs"
                                disabled={busy || isSettingEnabled}
                                onClick={() => void handleSetEnabled(extension.manifest.id, row.name, false)}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />}
                                {t("extensions.button.disable")}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 rounded-md px-3 text-xs"
                                disabled={busy || isSettingEnabled}
                                onClick={() => void handleSetEnabled(extension.manifest.id, row.name, true)}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                {t("extensions.button.enable")}
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground"
                              disabled={checking || busy}
                              onClick={() => void handleCheckUpdate(row.id, extension.manifest.version)}
                            >
                              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              {t("extensions.button.checkUpdate")}
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-md px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={busy || isUninstalling}
                              onClick={() => setUninstallTarget({ id: extension.manifest.id, name: row.name })}
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
                                {catalog.update_available
                                  ? t("extensions.catalog.updateAvailable")
                                  : t("extensions.catalog.upToDate")}
                              </span>
                            </div>
                            {catalog.release_notes ? (
                              <p className="line-clamp-2 text-muted-foreground">{catalog.release_notes}</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </ScrollArea>

      <AlertDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUninstallTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("extensions.dialog.uninstallTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("extensions.dialog.uninstallDescription", {
                name: uninstallTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executeUninstall()}
            >
              {t("extensions.button.uninstall")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
