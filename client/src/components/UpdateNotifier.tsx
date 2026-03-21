import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { desktopBridge } from "@/lib/desktop-bridge";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "error";

const FALLBACK_RELEASE_URL = "https://github.com/SevenThRe/Db-Schema-Ddl/releases";

function formatVersionLabel(version?: string | null): string {
  const normalized = String(version ?? "").trim();
  if (!normalized) return "v--";
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

interface UpdateNotifierProps {
  className?: string;
}

export function UpdateNotifier({ className }: UpdateNotifierProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [currentVersion] = useState(() => __APP_VERSION__);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const hasUpdate = status === "available";

  const runUpdateCheck = useCallback(async () => {
    setStatus("checking");
    setErrorMessage("");
    try {
      const result = await desktopBridge.updater.check();
      if (result.available && result.version) {
        setLatestVersion(result.version);
        setReleaseNotes(result.body ?? null);
        setStatus("available");
      } else {
        setStatus("current");
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "暂时无法连接发布服务。");
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setStatus("downloading");
    try {
      await desktopBridge.updater.downloadAndInstall();
      // ダウンロード・インストール後はアプリが再起動するので到達しない
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "安装失败，请手动下载。");
    }
  }, []);

  // ポップオープン時に自動チェック
  useEffect(() => {
    if (isOpen) void runUpdateCheck();
  }, [isOpen, runUpdateCheck]);

  const handleOpenReleasePage = useCallback(() => {
    void desktopBridge.openExternal(FALLBACK_RELEASE_URL);
  }, []);

  const statusMeta = useMemo(() => {
    switch (status) {
      case "checking":
        return { title: formatVersionLabel(currentVersion), summary: "正在检查更新…", tone: "text-muted-foreground" };
      case "available":
        return { title: formatVersionLabel(latestVersion), summary: "检测到新版本，可立即安装。", tone: "text-amber-500" };
      case "downloading":
        return { title: formatVersionLabel(latestVersion), summary: "正在下载并安装，完成后自动重启…", tone: "text-blue-500" };
      case "error":
        return { title: formatVersionLabel(currentVersion), summary: errorMessage || "检查失败。", tone: "text-destructive" };
      case "current":
      case "idle":
      default:
        return { title: formatVersionLabel(currentVersion), summary: "已是最新版本。", tone: "text-emerald-600" };
    }
  }, [currentVersion, errorMessage, latestVersion, status]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-7 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            className,
          )}
        >
          {status === "checking" || status === "downloading"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : null}
          {formatVersionLabel(currentVersion)}
          {hasUpdate ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[280px] rounded-md border border-border bg-background p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">当前版本</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => void runUpdateCheck()}
            disabled={status === "checking" || status === "downloading"}
          >
            {status === "checking"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="space-y-1 text-center">
            <div className={cn("text-3xl font-semibold tracking-tight", statusMeta.tone)}>
              {statusMeta.title}
              {status === "current" ? (
                <Check className="ml-1.5 inline h-5 w-5 text-emerald-500" />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{statusMeta.summary}</p>
          </div>

          {hasUpdate && latestVersion ? (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                最新版本 {formatVersionLabel(latestVersion)}
              </div>
              {releaseNotes ? (
                <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {releaseNotes}
                </div>
              ) : null}
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => void handleInstall()}
                disabled={status === "downloading"}
              >
                {status === "downloading"
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Download className="mr-1.5 h-3.5 w-3.5" />}
                {status === "downloading" ? "安装中…" : "立即安装"}
              </Button>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleOpenReleasePage}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            查看发布
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
