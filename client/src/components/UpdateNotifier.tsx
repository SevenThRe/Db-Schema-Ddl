import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { desktopBridge } from "@/lib/desktop-bridge";
import { useTranslation } from "react-i18next";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "error";

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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentVersion] = useState(() => __APP_VERSION__);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [canAutoInstall, setCanAutoInstall] = useState(false);
  const [releaseUrl, setReleaseUrl] = useState<string>(FALLBACK_RELEASE_URL);
  const [errorMessage, setErrorMessage] = useState("");

  const hasUpdate = status === "available";

  const runUpdateCheck = useCallback(async () => {
    setStatus("checking");
    setErrorMessage("");
    try {
      const result = await desktopBridge.updater.check();
      setCanAutoInstall(Boolean(result.canAutoInstall));
      setReleaseUrl(result.releaseUrl || FALLBACK_RELEASE_URL);
      if (result.available && result.version) {
        setLatestVersion(result.version);
        setReleaseNotes(result.body ?? null);
        setStatus("available");
      } else {
        setLatestVersion(result.version ?? null);
        setReleaseNotes(result.body ?? null);
        setStatus("current");
      }
    } catch (error) {
      setStatus("error");
      setCanAutoInstall(false);
      setReleaseUrl(FALLBACK_RELEASE_URL);
      setErrorMessage(error instanceof Error ? error.message : t("update.notifier.serviceUnavailable"));
    }
  }, [t]);

  const handleInstall = useCallback(async () => {
    setIsDownloading(true);
    try {
      await desktopBridge.updater.downloadAndInstall();
      // ダウンロード・インストール後はアプリが再起動するので到達しない
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : t("update.notifier.installFailed"));
    } finally {
      setIsDownloading(false);
    }
  }, [t]);

  // ポップオープン時に自動チェック
  useEffect(() => {
    if (isOpen) void runUpdateCheck();
  }, [isOpen, runUpdateCheck]);

  const handleOpenReleasePage = useCallback(() => {
    void desktopBridge.openExternal(releaseUrl || FALLBACK_RELEASE_URL);
  }, [releaseUrl]);

  const statusMeta = useMemo(() => {
    switch (status) {
      case "checking":
        return { title: formatVersionLabel(currentVersion), summary: t("update.notifier.checking"), tone: "text-muted-foreground" };
      case "available":
        return {
          title: formatVersionLabel(latestVersion),
          summary: isDownloading
            ? t("update.notifier.installing")
            : canAutoInstall
              ? t("update.notifier.availableReady")
              : t("update.notifier.availableManual"),
          tone: isDownloading ? "text-blue-500" : "text-amber-500",
        };
      case "error":
        return { title: formatVersionLabel(currentVersion), summary: errorMessage || t("update.notifier.checkFailed"), tone: "text-destructive" };
      case "current":
      case "idle":
      default:
        return { title: formatVersionLabel(currentVersion), summary: t("update.notifier.upToDate"), tone: "text-emerald-600" };
    }
  }, [canAutoInstall, currentVersion, errorMessage, isDownloading, latestVersion, status, t]);

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
          {status === "checking" || isDownloading
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
          <span className="text-xs font-medium text-muted-foreground">{t("update.notifier.currentVersion")}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => void runUpdateCheck()}
            disabled={status === "checking" || isDownloading}
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
                {t("update.notifier.latestVersion", { version: formatVersionLabel(latestVersion) })}
              </div>
              {releaseNotes ? (
                <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {releaseNotes}
                </div>
              ) : null}
              {canAutoInstall ? (
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => void handleInstall()}
                  disabled={isDownloading}
                >
                  {isDownloading
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Download className="mr-1.5 h-3.5 w-3.5" />}
                  {isDownloading ? t("update.notifier.installingShort") : t("update.notifier.installNow")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={handleOpenReleasePage}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {t("update.notifier.downloadFromRelease")}
                </Button>
              )}
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
            {t("update.notifier.viewRelease")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
