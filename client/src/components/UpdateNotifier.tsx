import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, DownloadCloud, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";

type UpdatePanelState = "idle" | "downloading" | "ready" | "error";

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * In-app update notifier for Electron builds.
 * Renders nothing for Web builds.
 */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingVersion, setPendingVersion] = useState("");
  const [downloadedVersion, setDownloadedVersion] = useState("");
  const [panelState, setPanelState] = useState<UpdatePanelState>("idle");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const pendingVersionRef = useRef("");

  const activeVersion = downloadedVersion || pendingVersion || pendingVersionRef.current;
  const normalizedProgress = clampProgress(downloadPercent);
  const visibleProgress = normalizedProgress === 0 ? 2 : normalizedProgress;
  const isPanelVisible = panelState !== "idle";

  const panelMeta = useMemo(() => {
    if (panelState === "ready") {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
        title: t("update.ready"),
        description: t("update.readyDesc", { version: activeVersion || "latest" }),
        accent: "border-emerald-200/80 dark:border-emerald-900/50",
      };
    }

    if (panelState === "error") {
      return {
        icon: <AlertCircle className="h-4 w-4 text-destructive" />,
        title: t("errors.common.title"),
        description: downloadError || t("errors.common.defaultDesc"),
        accent: "border-destructive/40",
      };
    }

    return {
      icon: <DownloadCloud className="h-4 w-4 text-primary" />,
      title: t("update.downloading"),
      description: t("update.availableDesc", { version: activeVersion || "latest" }),
      accent: "border-primary/35",
    };
  }, [activeVersion, downloadError, panelState, t]);

  const handleStartDownload = () => {
    setShowDownloadDialog(false);
    setDownloadedVersion("");
    setDownloadError("");
    setDownloadPercent(0);
    setPanelState("downloading");
    window.electronAPI?.startDownload();
  };

  const handleRetryDownload = () => {
    setDownloadError("");
    setDownloadPercent(0);
    setPanelState("downloading");
    window.electronAPI?.startDownload();
  };

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const offUpdateAvailable = window.electronAPI.onUpdateAvailable((info) => {
      pendingVersionRef.current = info.version;
      setPendingVersion(info.version);
      setDownloadedVersion("");
      setDownloadError("");
      setDownloadPercent(0);
      setPanelState("idle");
      setShowDownloadDialog(true);
    });

    const offDownloadProgress = window.electronAPI.onDownloadProgress((progress) => {
      setPanelState("downloading");
      setDownloadError("");
      setDownloadPercent(clampProgress(progress.percent));
    });

    const offUpdateDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setDownloadedVersion(info.version);
      setDownloadPercent(100);
      setDownloadError("");
      setPanelState("ready");
    });

    const offUpdateError = window.electronAPI.onUpdateError((error) => {
      setPanelState("error");
      setDownloadError(error.message || t("errors.common.defaultDesc"));
    });

    return () => {
      offUpdateAvailable?.();
      offDownloadProgress?.();
      offUpdateDownloaded?.();
      offUpdateError?.();
    };
  }, [t]);

  if (!window.electronAPI) {
    return null;
  }

  return (
    <>
      <AlertDialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("update.askDownload")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("update.askDownloadDesc", { version: pendingVersion })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("update.later")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartDownload}>{t("update.downloadNow")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isPanelVisible ? (
        <section
          className={cn(
            "fixed bottom-4 right-4 z-[120] w-[min(92vw,380px)] rounded-xl border bg-background/98 shadow-xl backdrop-blur-sm",
            panelMeta.accent,
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 shrink-0 rounded-full border border-border/60 bg-muted/60 p-1.5">
              {panelMeta.icon}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold leading-none">{panelMeta.title}</p>
              <p className="text-xs text-muted-foreground break-words">{panelMeta.description}</p>

              {panelState === "downloading" ? (
                <div className="space-y-1.5 pt-1">
                  <Progress value={visibleProgress} className="h-1.5" />
                  <div className="text-[11px] text-muted-foreground">
                    {t("update.downloadProgress", { percent: normalizedProgress })}
                  </div>
                </div>
              ) : null}

              {panelState === "error" && downloadError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  {downloadError}
                </div>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setPanelState("idle")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2.5">
            {panelState === "ready" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setPanelState("idle")}>
                  {t("update.restartLater")}
                </Button>
                <Button size="sm" onClick={() => window.electronAPI?.installUpdate()}>
                  {t("update.restartNow")}
                </Button>
              </>
            ) : null}

            {panelState === "error" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setPanelState("idle")}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={handleRetryDownload}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  {t("update.downloadNow")}
                </Button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
