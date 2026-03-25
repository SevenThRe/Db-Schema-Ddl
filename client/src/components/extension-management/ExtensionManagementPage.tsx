// 拡張機能管理ページ — インストール済み拡張の一覧・有効化トグル・起動・卸载
//
// useExtensionHost() からの ResolvedExtension[] を直接使用し、
// ext_set_enabled IPC 後に queryClient.invalidateQueries でサイドバーを即時更新する。
// db-connector (DbConnector) と kind==="external" のみを表示する（Transformer/Utility を除外）。

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useExtensionHost } from "@/extensions/host-context";
import { useToast } from "@/hooks/use-toast";
import type { MainSurface } from "@/extensions/host-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Database, Puzzle } from "lucide-react";
import * as LucideIcons from "lucide-react";

// ──────────────────────────────────────────────
// Props 型定義
// ──────────────────────────────────────────────

interface ExtensionManagementPageProps {
  onNavigate?: (surface: MainSurface) => void;
}

// ──────────────────────────────────────────────
// アイコン解決ユーティリティ
// ──────────────────────────────────────────────

/** 拡張マニフェストのアイコン名から Lucide コンポーネントを返す。不明な場合は Database にフォールバック */
function resolveIcon(iconName?: string): React.ElementType {
  if (!iconName) return Database;
  const Icons = LucideIcons as Record<string, unknown>;
  const component = Icons[iconName];
  if (typeof component === "function" || (typeof component === "object" && component !== null)) {
    return component as React.ElementType;
  }
  return Database;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export function ExtensionManagementPage({ onNavigate }: ExtensionManagementPageProps) {
  const queryClient = useQueryClient();
  const { extensions, isLoading } = useExtensionHost();
  const { toast } = useToast();

  // 「卸载」確認ダイアログの状態
  const [uninstallTarget, setUninstallTarget] = useState<{ id: string; name: string } | null>(null);
  // 一時的に「已卸载」扱いにするローカルセット（Phase 4 では本物の卸载 IPC がない）
  const [uninstalledIds, setUninstalledIds] = useState<Set<string>>(new Set());

  // DbConnector カテゴリ（db-connector）と external 拡張のみ表示
  // builtin の Transformer / Utility は "機能" であって "拡張" ではないため非表示
  const filteredExtensions = extensions.filter(
    (e) => e.manifest.id === "db-connector" || e.manifest.kind === "external",
  );

  // ──────────────────────────────────────────────
  // 有効 / 無効 トグルハンドラ（D-19, D-25, EXTUI-05）
  // キャッシュ無効化によりサイドバーのナビゲーション項目を即時更新する（60s staleTime を上書き）
  // ──────────────────────────────────────────────
  async function handleSetEnabled(id: string, name: string, enabled: boolean) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("ext_set_enabled", { id, enabled });
      // サイドバーナビゲーションを即時反映するためキャッシュを無効化
      await queryClient.invalidateQueries({ queryKey: ["extensions", "all"] });
      toast({
        title: enabled ? `${name} 已启用` : `${name} 已禁用`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "操作失败",
        description: String(err),
        variant: "destructive",
      });
    }
  }

  // ──────────────────────────────────────────────
  // 卸载確認ダイアログを開く
  // ──────────────────────────────────────────────
  function handleUninstallConfirm(id: string, name: string) {
    setUninstallTarget({ id, name });
  }

  // ──────────────────────────────────────────────
  // 卸载実行（Phase 4: ext_set_enabled + ローカル状態）
  // 本格的な卸载 IPC は将来フェーズで実装する
  // ──────────────────────────────────────────────
  async function executeUninstall() {
    if (!uninstallTarget) return;
    const { id, name } = uninstallTarget;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("ext_set_enabled", { id, enabled: false });
      await queryClient.invalidateQueries({ queryKey: ["extensions", "all"] });
      setUninstalledIds((prev) => { const next = new Set(prev); next.add(id); return next; });
      toast({
        title: `${name} 已卸载`,
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "卸载失败",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setUninstallTarget(null);
    }
  }

  // ──────────────────────────────────────────────
  // レンダリング
  // ──────────────────────────────────────────────

  return (
    <>
      <ScrollArea className="h-full w-full">
        <div className="mx-auto max-w-2xl px-6 py-12">
          {/* ページタイトル */}
          <h1 className="text-xl font-semibold">扩展功能管理</h1>
          <p className="mt-2 text-xs text-muted-foreground">管理已安装的扩展功能及其启用状态</p>

          {/* 拡張カード一覧 */}
          <div className="mt-8 space-y-4">
            {isLoading && (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            )}

            {!isLoading && filteredExtensions.map((ext) => {
              const isUninstalled = uninstalledIds.has(ext.manifest.id);
              // アイコン解決: Contribution ナビゲーション項目のアイコン、またはフォールバック
              const navIcon = ext.manifest.contributes?.navigation?.[0]?.icon;
              const IconComponent = resolveIcon(navIcon);

              return (
                <Card key={ext.manifest.id} className="p-6">
                  <div className="flex items-start gap-4">
                    {/* 拡張アイコン */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* メタ情報 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold">{ext.manifest.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          v{ext.manifest.version}
                        </Badge>
                        {isUninstalled && (
                          <Badge variant="secondary" className="text-xs text-muted-foreground">
                            已卸载
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {ext.manifest.description || "暂无描述"}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        来源: {ext.manifest.kind === "builtin" ? "bundled" : "external"}
                      </p>

                      <Separator className="my-3" />

                      {/* Capability バッジ */}
                      <div className="flex flex-wrap gap-1.5">
                        {ext.manifest.capabilities.length > 0 ? (
                          ext.manifest.capabilities.map((cap) => (
                            <Badge key={cap} variant="secondary" className="text-xs">
                              {cap}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无功能声明</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* アクション行 */}
                  <div className="mt-4 flex items-center justify-between">
                    {/* 有効化トグル */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ext.enabled && !isUninstalled}
                        disabled={isUninstalled}
                        onCheckedChange={(checked) =>
                          handleSetEnabled(ext.manifest.id, ext.manifest.name, checked)
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {isUninstalled ? "已卸载" : ext.enabled ? "启用" : "禁用"}
                      </span>
                    </div>

                    {/* 起動・卸载ボタン */}
                    <div className="flex items-center gap-2">
                      {isUninstalled ? (
                        // 卸载後は「重新安装」プレースホルダーを表示
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled
                        >
                          重新安装
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!ext.enabled}
                            onClick={() => {
                              // 最初のワークスペースパネルへナビゲート
                              const panels = ext.manifest.contributes?.workspacePanels ?? [];
                              onNavigate?.({
                                kind: "extension",
                                extensionId: ext.manifest.id,
                                panelId: panels[0]?.id ?? ext.manifest.id,
                              });
                            }}
                          >
                            打开
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleUninstallConfirm(ext.manifest.id, ext.manifest.name)
                            }
                          >
                            卸载
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* 空状態 */}
            {!isLoading && filteredExtensions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Puzzle className="h-12 w-12 text-muted-foreground/30" />
                <h3 className="mt-4 text-base font-semibold text-muted-foreground">
                  尚未安装任何扩展
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">扩展功能将在此处显示。</p>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 卸载確認ダイアログ（D-18, D-20, D-21） */}
      <AlertDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认卸载</AlertDialogTitle>
            <AlertDialogDescription>
              卸载后将无法使用{uninstallTarget?.name ? ` "${uninstallTarget.name}"` : ""}
              ，需重新安装才能恢复。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executeUninstall()}
            >
              确认卸载
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
