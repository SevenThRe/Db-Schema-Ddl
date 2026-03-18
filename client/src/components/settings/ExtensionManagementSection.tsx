import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  useDisableExtension,
  useEnableExtension,
  useExtension,
  useRefreshExtensionCatalog,
  useStartExtensionInstall,
  useUninstallExtension,
} from "@/hooks/use-extensions";
import { DB_MANAGEMENT_EXTENSION_ID } from "@shared/schema";
import {
  AlertTriangle,
  Database,
  Download,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

function lifecycleLabel(stage?: string): string {
  switch (stage) {
    case "checking":
      return "检查更新中";
    case "downloading":
      return "下载中";
    case "verifying":
      return "校验中";
    case "installing":
      return "安装中";
    case "ready_to_enable":
      return "等待启用";
    case "update_available":
      return "可更新";
    case "failed":
      return "处理失败";
    case "uninstalling":
      return "卸载中";
    default:
      return "空闲";
  }
}

export function ExtensionManagementSection() {
  const { data: extension } = useExtension(DB_MANAGEMENT_EXTENSION_ID);
  const refreshCatalog = useRefreshExtensionCatalog();
  const startInstall = useStartExtensionInstall();
  const enableExtension = useEnableExtension();
  const disableExtension = useDisableExtension();
  const uninstallExtension = useUninstallExtension();
  const { toast } = useToast();

  useEffect(() => {
    if (!window.electronAPI?.extensions) {
      return;
    }
    refreshCatalog.mutate(DB_MANAGEMENT_EXTENSION_ID);
  }, []);

  const lifecycle = extension?.lifecycle;
  const busy =
    refreshCatalog.isPending ||
    startInstall.isPending ||
    enableExtension.isPending ||
    disableExtension.isPending ||
    uninstallExtension.isPending;

  const handleActivate = async () => {
    if (!window.electronAPI?.extensions?.activate) {
      toast({
        title: "扩展管理",
        description: "当前环境暂不支持立即启用扩展。",
        variant: "destructive",
      });
      return;
    }

    try {
      await window.electronAPI.extensions.activate(DB_MANAGEMENT_EXTENSION_ID);
    } catch (error) {
      toast({
        title: "扩展管理",
        description: error instanceof Error ? error.message : "启用扩展失败。",
        variant: "destructive",
      });
    }
  };

  const lifecycleStage = lifecycle?.stage;
  const progressValue =
    lifecycleStage === "downloading" || lifecycleStage === "verifying" || lifecycleStage === "installing"
      ? lifecycle?.progressPercent ?? 0
      : 0;

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">扩展管理</h2>
            <Badge variant="outline" className="text-[10px]">官方扩展</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            DB 管理作为按需下载的官方扩展交付。这里集中处理安装、更新、启用和卸载。
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => refreshCatalog.mutate(DB_MANAGEMENT_EXTENSION_ID)}
          disabled={refreshCatalog.isPending}
        >
          {refreshCatalog.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          检查更新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">当前状态</div>
          <div className="mt-1 text-sm font-medium text-foreground">{extension?.stateLabel ?? "未安装"}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">已安装版本</div>
          <div className="mt-1 text-sm font-medium text-foreground">{extension?.installedVersion ?? "尚未安装"}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">可用版本</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {extension?.updateVersion ?? extension?.catalog?.version ?? "未检查"}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">生命周期</div>
          <div className="mt-1 text-sm font-medium text-foreground">{lifecycleLabel(lifecycleStage)}</div>
        </div>
      </div>

      {extension?.catalog ? (
        <div className="rounded-lg border border-border/70 bg-background p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {extension.catalog.version}
                {extension.catalog.package?.size ? ` · ${(extension.catalog.package.size / (1024 * 1024)).toFixed(1)} MB` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {extension.catalog.compatibilityMessage ?? extension.catalog.summary ?? "官方扩展元数据已就绪。"}
              </div>
              {extension.catalog.releaseNotes ? (
                <div className="text-xs text-muted-foreground line-clamp-3">{extension.catalog.releaseNotes}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {lifecycle ? (
        <div className="rounded-lg border border-border/70 bg-background p-4 space-y-3">
          <div className="flex items-start gap-2">
            {lifecycle.stage === "failed" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <div className="space-y-1 min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{lifecycleLabel(lifecycle.stage)}</div>
              <div className="text-xs text-muted-foreground">
                {lifecycle.lastErrorMessage ??
                  (lifecycle.stage === "ready_to_enable"
                    ? "扩展已安装完成，点击立即启用后会自动重启应用。"
                    : "当前扩展生命周期状态会同步到 Sidebar 和安装面板。")}
              </div>
            </div>
          </div>

          {progressValue > 0 ? (
            <div className="space-y-1">
              <Progress value={progressValue} className="h-2" />
              <div className="text-[11px] text-muted-foreground">
                {progressValue}%{lifecycle.totalBytes ? ` · ${Math.round((lifecycle.downloadedBytes / (1024 * 1024)) * 10) / 10}/${Math.round((lifecycle.totalBytes / (1024 * 1024)) * 10) / 10} MB` : ""}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {extension?.status === "not_installed" ? (
          <Button
            type="button"
            onClick={() => startInstall.mutate(DB_MANAGEMENT_EXTENSION_ID)}
            disabled={busy}
          >
            {startInstall.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            下载并安装
          </Button>
        ) : null}

        {extension?.updateAvailable ? (
          <Button
            type="button"
            onClick={() => startInstall.mutate(DB_MANAGEMENT_EXTENSION_ID)}
            disabled={busy}
          >
            {startInstall.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            更新到 {extension.updateVersion}
          </Button>
        ) : null}

        {extension?.status === "disabled" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => enableExtension.mutate(DB_MANAGEMENT_EXTENSION_ID)}
            disabled={busy}
          >
            {enableExtension.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
            启用
          </Button>
        ) : null}

        {extension?.status === "enabled" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => disableExtension.mutate(DB_MANAGEMENT_EXTENSION_ID)}
            disabled={busy}
          >
            {disableExtension.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
            禁用
          </Button>
        ) : null}

        {lifecycle?.stage === "ready_to_enable" ? (
          <Button type="button" onClick={() => void handleActivate()} disabled={busy}>
            立即启用
          </Button>
        ) : null}

        {extension?.status !== "not_installed" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => uninstallExtension.mutate(DB_MANAGEMENT_EXTENSION_ID)}
            disabled={busy}
          >
            {uninstallExtension.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            卸载
          </Button>
        ) : null}
      </div>
    </div>
  );
}
