import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

/**
 * Electron アプリケーション内での自動更新通知コンポーネント
 * Web版では何もレンダリングしない
 */
export function UpdateNotifier() {
  const { toast } = useToast();
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    // Electron環境でない場合は何もしない
    if (!window.electronAPI) {
      return;
    }

    /**
     * 新しいバージョンが利用可能になった際の通知
     */
    window.electronAPI.onUpdateAvailable((info) => {
      toast({
        title: '新しいバージョンが利用可能です',
        description: `バージョン ${info.version} のダウンロードを開始しています...`,
        duration: 5000,
      });
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
      toast({
        title: 'アップデートの準備が完了しました',
        description: `バージョン ${info.version} をインストールするには、アプリケーションを再起動してください。`,
        duration: 0, // 手動で閉じるまで表示
        action: (
          <Button
            size="sm"
            onClick={() => {
              window.electronAPI?.installUpdate();
            }}
          >
            今すぐ再起動
          </Button>
        ),
      });
    });
  }, [toast]);

  // Electron環境でない場合は何も表示しない
  if (!window.electronAPI) {
    return null;
  }

  // ダウンロード中の進捗表示（オプション）
  if (downloadProgress > 0 && downloadProgress < 100 && !updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 max-w-sm">
        <p className="text-sm font-medium mb-2">アップデートをダウンロード中...</p>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{downloadProgress}%</p>
      </div>
    );
  }

  return null;
}
