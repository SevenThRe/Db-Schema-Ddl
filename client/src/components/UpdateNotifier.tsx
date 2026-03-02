import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

/**
 * Electron アプリケーション内での自動更新通知コンポーネント
 * Web版では何もレンダリングしない
 */
export function UpdateNotifier() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingVersion, setPendingVersion] = useState('');
  const pendingVersionRef = useRef('');
  const downloadToastRef = useRef<ReturnType<typeof toast> | null>(null);

  const buildDownloadDescription = (version: string, percent: number) => {
    const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    const progressValue = normalizedPercent === 0 ? 2 : normalizedPercent;
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {t('update.availableDesc', { version: version || pendingVersionRef.current })}
        </div>
        <Progress value={progressValue} className="h-1.5" />
        <div className="text-[11px] text-muted-foreground">
          {t('update.downloadProgress', { percent: normalizedPercent })}
        </div>
      </div>
    );
  };

  const showOrUpdateDownloadToast = (percent: number) => {
    const version = pendingVersionRef.current;
    const description = buildDownloadDescription(version, percent);

    if (downloadToastRef.current) {
      downloadToastRef.current.update({
        id: downloadToastRef.current.id,
        title: t('update.downloading'),
        description,
        duration: 0,
      });
      return;
    }

    downloadToastRef.current = toast({
      title: t('update.downloading'),
      description,
      duration: 0,
    });
  };

  useEffect(() => {
    // Electron環境でない場合は何もしない
    if (!window.electronAPI) {
      return;
    }

    /**
     * 新しいバージョンが利用可能になった際の通知
     * ユーザーに確認を求める
     */
    window.electronAPI.onUpdateAvailable((info) => {
      pendingVersionRef.current = info.version;
      setPendingVersion(info.version);
      setShowDownloadDialog(true);
    });

    /**
     * ダウンロード進捗状況の表示
     */
    window.electronAPI.onDownloadProgress((progress) => {
      showOrUpdateDownloadToast(progress.percent);
    });

    /**
     * ダウンロード完了時の通知
     */
    window.electronAPI.onUpdateDownloaded((info) => {
      if (downloadToastRef.current) {
        downloadToastRef.current.dismiss();
        downloadToastRef.current = null;
      }
      toast({
        title: t('update.ready'),
        description: t('update.readyDesc', { version: info.version }),
        duration: 0, // 手動で閉じるまで表示
        action: (
          <Button
            size="sm"
            onClick={() => {
              window.electronAPI?.installUpdate();
            }}
          >
            {t('update.restartNow')}
          </Button>
        ),
      });
    });
  }, [toast, t]);

  // Electron環境でない場合は何も表示しない
  if (!window.electronAPI) {
    return null;
  }

  return (
    <>
      {/* ダウンロード確認ダイアログ */}
      <AlertDialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('update.askDownload')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('update.askDownloadDesc', { version: pendingVersion })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('update.later')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDownloadDialog(false);
                // ダウンロードを開始
                showOrUpdateDownloadToast(0);
                window.electronAPI?.startDownload();
              }}
            >
              {t('update.downloadNow')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
