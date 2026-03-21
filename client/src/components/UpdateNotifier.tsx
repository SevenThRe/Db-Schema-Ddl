import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "error";

const FALLBACK_RELEASE_URL = "https://github.com/SevenThRe/Db-Schema-Ddl/releases";
const GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/SevenThRe/Db-Schema-Ddl/releases/latest";

function formatVersionLabel(version?: string | null): string {
  const normalized = String(version ?? "").trim();
  if (!normalized) return "v--";
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

function normalizeVersion(version?: string | null): number[] {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function isRemoteVersionNewer(currentVersion: string, latestVersion: string): boolean {
  const current = normalizeVersion(currentVersion);
  const latest = normalizeVersion(latestVersion);
  const length = Math.max(current.length, latest.length);
  for (let i = 0; i < length; i++) {
    const c = current[i] ?? 0;
    const l = latest[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

interface UpdateNotifierProps {
  className?: string;
}

export function UpdateNotifier({ className }: UpdateNotifierProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [currentVersion] = useState(() => __APP_VERSION__);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = useState(FALLBACK_RELEASE_URL);
  const [errorMessage, setErrorMessage] = useState("");

  const hasUpdate = status === "available";

  const runUpdateCheck = useCallback(async () => {
    setStatus("checking");
    setErrorMessage("");
    try {
      const response = await fetch(GITHUB_LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) {
        throw new Error(`暂时无法连接发布服务。(HTTP ${response.status})`);
      }
      const payload = (await response.json()) as { tag_name?: string; html_url?: string };
      const latest = payload.tag_name ?? currentVersion;
      setLatestVersion(latest);
      setReleaseUrl(payload.html_url ?? FALLBACK_RELEASE_URL);
      setStatus(isRemoteVersionNewer(currentVersion, latest) ? "available" : "current");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "无法获取更新信息。");
    }
  }, [currentVersion]);

  // ポップオープン時に自動チェック
  useEffect(() => {
    if (isOpen) void runUpdateCheck();
  }, [isOpen, runUpdateCheck]);

  const handleOpenReleasePage = useCallback(() => {
    window.open(releaseUrl, "_blank", "noopener,noreferrer");
  }, [releaseUrl]);

  const statusMeta = useMemo(() => {
    switch (status) {
      case "checking":
        return { title: formatVersionLabel(currentVersion), summary: "正在检查更新…", tone: "text-muted-foreground" };
      case "available":
        return { title: formatVersionLabel(latestVersion), summary: "检测到新版本，点击下方前往下载。", tone: "text-amber-500" };
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
          {status === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
            disabled={status === "checking"}
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
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              最新版本 {formatVersionLabel(latestVersion)}
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
