import type { ExtensionHostState } from "@shared/schema";
import { AlertTriangle, Loader2, PlugZap, RefreshCw, ShieldAlert } from "lucide-react";
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

interface ExtensionStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extension: ExtensionHostState | null;
  isPending?: boolean;
  onPrimaryAction: () => void | Promise<void>;
  primaryActionLabel: string;
}

function statusCopy(extension: ExtensionHostState | null): { title: string; description: string } {
  if (extension?.updateAvailable) {
    return {
      title: "官方扩展有可用更新",
      description: `检测到 ${extension.updateVersion ?? "新版本"}，可以继续更新以保持 Sidebar 与设置页状态一致。`,
    };
  }

  if (extension?.status === "incompatible") {
    return {
      title: "扩展需要更新",
      description: "当前安装的官方扩展与主程序版本不兼容，需要先更新扩展或升级主程序。",
    };
  }

  if (extension?.lifecycle?.stage === "failed") {
    return {
      title: "扩展处理失败",
      description: extension.lifecycle.lastErrorMessage ?? "扩展生命周期操作失败，请按照提示重试。",
    };
  }

  return {
    title: "扩展已禁用",
    description: "官方扩展已安装，但当前处于禁用状态。重新启用后会恢复 DB 管理模块入口。",
  };
}

export function ExtensionStatusDialog({
  open,
  onOpenChange,
  extension,
  isPending = false,
  onPrimaryAction,
  primaryActionLabel,
}: ExtensionStatusDialogProps) {
  const copy = statusCopy(extension);
  const isFailure = extension?.lifecycle?.stage === "failed";
  const isUpdate = Boolean(extension?.updateAvailable);
  const isIncompatible = extension?.status === "incompatible";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <DialogTitle>{copy.title}</DialogTitle>
            <Badge variant="outline" className="text-[10px]">官方扩展</Badge>
          </div>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              {isUpdate ? (
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : isIncompatible ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : isFailure ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <div className="space-y-1">
                <div className="font-medium text-foreground">
                  {extension?.name ?? "DB 管理"}
                  {extension?.installedVersion ? ` · v${extension.installedVersion}` : ""}
                </div>
                <div>{extension?.compatibilityMessage ?? extension?.lifecycle?.lastErrorMessage ?? "处理后会自动回到可用状态。"}</div>
              </div>
            </div>
          </div>

          {isFailure ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>恢复建议</AlertTitle>
              <AlertDescription>
                v1 会直接给出明确下一步，不展示原始日志。你可以在这里重试，或者进入设置页查看完整扩展管理状态。
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button onClick={() => void onPrimaryAction()} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {primaryActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
