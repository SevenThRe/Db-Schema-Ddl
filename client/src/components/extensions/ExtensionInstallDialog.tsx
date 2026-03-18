import type { ExtensionHostState } from "@shared/schema";
import { AlertTriangle, CheckCircle2, Download, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface ExtensionInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extension: ExtensionHostState | null;
  isPending?: boolean;
  onInstall: () => void | Promise<void>;
  onActivate: () => void | Promise<void>;
  onRefreshCatalog?: () => void | Promise<void>;
}

function formatPackageSize(size?: number): string {
  if (!size || size <= 0) {
    return "未知";
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function stageLabel(stage?: string): string {
  switch (stage) {
    case "checking":
      return "正在检查官方扩展";
    case "downloading":
      return "正在下载扩展包";
    case "verifying":
      return "正在校验包完整性";
    case "installing":
      return "正在安装扩展";
    case "ready_to_enable":
      return "扩展已安装完成";
    case "failed":
      return "安装流程遇到问题";
    default:
      return "准备安装";
  }
}

export function ExtensionInstallDialog({
  open,
  onOpenChange,
  extension,
  isPending = false,
  onInstall,
  onActivate,
  onRefreshCatalog,
}: ExtensionInstallDialogProps) {
  const lifecycle = extension?.lifecycle;
  const catalog = extension?.catalog;
  const stage = lifecycle?.stage;
  const inProgress = stage === "checking" || stage === "downloading" || stage === "verifying" || stage === "installing";
  const installReady = stage === "ready_to_enable";
  const failed = stage === "failed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <DialogTitle>安装官方扩展</DialogTitle>
            <Badge variant="outline" className="text-[10px]">官方扩展</Badge>
          </div>
          <DialogDescription>
            DB 管理以可选扩展方式交付。基础安装包默认不包含这部分能力，按需下载安装后即可启用。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/25 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm font-medium text-foreground">
                  {catalog?.version ?? extension?.installedVersion ?? "等待检查版本"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {catalog?.compatibilityMessage ?? catalog?.summary ?? "会从 GitHub 官方发布源下载并校验扩展包。"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <div className="text-muted-foreground">版本</div>
                <div className="mt-1 font-medium text-foreground">{catalog?.version ?? "未获取"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <div className="text-muted-foreground">大小</div>
                <div className="mt-1 font-medium text-foreground">{formatPackageSize(catalog?.package?.size)}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <div className="text-muted-foreground">兼容性</div>
                <div className="mt-1 font-medium text-foreground">
                  {catalog?.compatibilityStatus === "incompatible" ? "需要更新主程序" : "可安装"}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                <div className="text-muted-foreground">更新摘要</div>
                <div className="mt-1 font-medium text-foreground line-clamp-2">
                  {catalog?.summary ?? "安装后可直接进入 DB 管理模块。"}
                </div>
              </div>
            </div>
          </div>

          {inProgress ? (
            <div className="rounded-xl border border-border/70 bg-background p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {stageLabel(stage)}
              </div>
              <Progress value={lifecycle?.progressPercent ?? 0} className="h-2" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{lifecycle?.progressPercent ?? 0}%</span>
                <span>
                  {lifecycle?.downloadedBytes && lifecycle?.totalBytes
                    ? `${(lifecycle.downloadedBytes / (1024 * 1024)).toFixed(1)} / ${(lifecycle.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                    : "请稍候"}
                </span>
              </div>
            </div>
          ) : null}

          {installReady ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>扩展已安装完成</AlertTitle>
              <AlertDescription>
                宿主已经完成下载、校验和安装。点击“立即启用”后会自动重启应用，让扩展进入可用状态。
              </AlertDescription>
            </Alert>
          ) : null}

          {failed ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{stageLabel(stage)}</AlertTitle>
              <AlertDescription>
                {lifecycle?.lastErrorMessage ?? "官方扩展安装失败，请重试。"}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>

          {onRefreshCatalog ? (
            <Button variant="outline" onClick={() => void onRefreshCatalog()} disabled={isPending || inProgress}>
              检查更新
            </Button>
          ) : null}

          {installReady ? (
            <Button onClick={() => void onActivate()} disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              立即启用
            </Button>
          ) : (
            <Button onClick={() => void onInstall()} disabled={isPending || inProgress || catalog?.compatibilityStatus === "incompatible"}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {failed ? "重试安装" : "下载并安装"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
