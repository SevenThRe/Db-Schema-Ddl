import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingVersion, setPendingVersion] = useState('');

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
      setPendingVersion(info.version);
      setShowDownloadDialog(true);
    });

    /**
     * ダウンロード進捗状況の表示
     */
    window.electronAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress.percent);
    });

    /**
     * ダウンロード完了時の通知
     */
    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateDownloaded(true);
      setDownloadProgress(0);
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
                window.electronAPI?.startDownload();
                toast({
                  title: t('update.available'),
                  description: t('update.availableDesc', { version: pendingVersion }),
                  duration: 5000,
                });
              }}
            >
              {t('update.downloadNow')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ダウンロード中の進捗表示 */}
      {downloadProgress > 0 && downloadProgress < 100 && !updateDownloaded && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 max-w-sm z-50">
          <p className="text-sm font-medium mb-2">{t('update.downloading')}</p>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('update.downloadProgress', { percent: downloadProgress })}
          </p>
        </div>
      )}
    </>
  );
}
