import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DbConnectionConfig } from "@shared/schema";

export function ConnectionCenterHeader({
  activeConnection,
  onAddConnection,
  onReturnToWorkspace,
}: {
  activeConnection: DbConnectionConfig | null;
  onAddConnection: () => void;
  onReturnToWorkspace: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between px-3 py-2">
      <div>
        <p className="text-xs font-medium text-foreground">连接中心</p>
        <p className="text-[10px] text-muted-foreground">
          Connection Center is a primary support surface. 在这里配置、恢复或整理连接，然后回到统一的 Database Workspace daily-driver route；Schema 与 Diff 仅保留为 compatibility-only surfaces。
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          当前构建仅承诺 direct MySQL / PostgreSQL 连接与安全保存密码；SSH / TLS / 企业认证仍未作为产品能力承诺。
        </p>
      </div>
      <div className="flex items-center gap-2">
        {activeConnection ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onReturnToWorkspace}
          >
            返回 Database Workspace
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={onAddConnection}
        >
          <Plus className="mr-1 h-3 w-3" />
          添加
        </Button>
      </div>
    </div>
  );
}
