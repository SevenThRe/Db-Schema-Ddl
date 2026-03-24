// DB 工作台 — メインレイアウトシェル
//
// 3 ペイン構成:
//   - 環境帯（28px、接続の environment が設定されている場合のみ）
//   - 左サイドバー（200px 固定、bg-sidebar）
//     - 接続名 + 環境インジケーター + 切替ボタン
//   - メインエリア（flex-1）
//     - タブバープレースホルダー（36px）
//     - ツールバープレースホルダー（36px）
//     - エディターエリア（flex-1）— Monaco エディターを後続フェーズで実装
//     - 結果エリア（min-h-[120px]）— 結果グリッドを後続フェーズで実装

import { Lock } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig } from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface WorkbenchLayoutProps {
  /** アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** ホスト API（将来のクエリ実行・キャンセル等で使用） */
  hostApi: HostApi;
  /** レガシービューへ切り替えるコールバック */
  onSwitchToLegacy: () => void;
}

// ──────────────────────────────────────────────
// 環境帯コンポーネント
// ──────────────────────────────────────────────

/** 接続の environment に応じた色帯を表示する */
function EnvironmentBand({
  connection,
}: {
  connection: DbConnectionConfig;
}) {
  const env = connection.environment;
  if (!env) return null;

  // 環境ラベルと CSS 変数クラスのマッピング
  const envConfig: Record<
    string,
    { label: string; bgClass: string; fgClass: string }
  > = {
    prod: {
      label: "PRODUCTION",
      bgClass: "bg-[hsl(var(--env-prod))]",
      fgClass: "text-[hsl(var(--env-prod-fg))]",
    },
    test: {
      label: "TEST",
      bgClass: "bg-[hsl(var(--env-test))]",
      fgClass: "text-[hsl(var(--env-test-fg))]",
    },
    dev: {
      label: "DEV",
      bgClass: "bg-[hsl(var(--env-dev))]",
      fgClass: "text-[hsl(var(--env-dev-fg))]",
    },
  };

  const config = envConfig[env];
  if (!config) return null;

  return (
    <div
      className={cn(
        "flex h-[28px] w-full items-center justify-center gap-1.5 text-xs font-semibold",
        config.bgClass,
        config.fgClass,
      )}
    >
      <span>{config.label}</span>
      {/* 読み取り専用接続はロックアイコンを表示 */}
      {connection.readonly && (
        <>
          <Lock className="h-3 w-3" />
          <span>READ-ONLY</span>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// 左サイドバーコンポーネント
// ──────────────────────────────────────────────

/** 接続情報・環境インジケーター・切替リンクを表示する左サイドバー */
function WorkbenchSidebar({
  connection,
  onSwitchToLegacy,
}: {
  connection: DbConnectionConfig;
  onSwitchToLegacy: () => void;
}) {
  const env = connection.environment;

  // 環境ドットの色クラスマッピング
  const envDotClass: Record<string, string> = {
    prod: "bg-[hsl(var(--env-prod))]",
    test: "bg-[hsl(var(--env-test))]",
    dev: "bg-[hsl(var(--env-dev))]",
  };

  return (
    <div className="flex h-full w-full flex-col gap-2 bg-sidebar p-3">
      {/* 接続名と環境インジケーター */}
      <div className="flex items-center gap-2">
        {/* 環境カラードット（8px 円） */}
        {env && envDotClass[env] && (
          <div
            className={cn("h-2 w-2 shrink-0 rounded-full", envDotClass[env])}
            aria-label={`環境: ${env}`}
          />
        )}
        <span className="truncate text-xs font-semibold text-sidebar-foreground">
          {connection.name || connection.database}
        </span>
        {/* 読み取り専用ロックアイコン */}
        {connection.readonly && (
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="読み取り専用" />
        )}
      </div>

      {/* データベース名（サブ情報） */}
      <span className="truncate text-[11px] text-muted-foreground">
        {connection.driver}:{connection.host}:{connection.port}/{connection.database}
      </span>

      {/* 接続切替リンク */}
      <button
        type="button"
        className="mt-auto text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={onSwitchToLegacy}
      >
        接続を切り替える
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// メインレイアウトシェル
// ──────────────────────────────────────────────

/**
 * DB 工作台 メインレイアウトシェル
 *
 * 環境帯 + 左サイドバー + エディター/結果分割ペインで構成される。
 * 各子エリア（Monaco エディター・結果グリッド）は後続フェーズで実装する。
 */
export function WorkbenchLayout({
  connection,
  hostApi: _hostApi,
  onSwitchToLegacy,
}: WorkbenchLayoutProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 環境帯 — prod/test/dev 接続時のみ表示 */}
      <EnvironmentBand connection={connection} />

      {/* メインボディ: サイドバー + コンテンツエリア */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドバー — 200px 固定幅 */}
        <div className="w-[200px] shrink-0 border-r border-border">
          <WorkbenchSidebar
            connection={connection}
            onSwitchToLegacy={onSwitchToLegacy}
          />
        </div>

        {/* コンテンツエリア — タブバー + ツールバー + エディター/結果 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* タブバープレースホルダー（36px） */}
          <div className="flex h-[36px] shrink-0 items-center gap-1 border-b border-border bg-panel-muted px-2">
            <div className="flex h-[26px] items-center rounded-md bg-background px-3 text-xs font-medium text-foreground shadow-sm border border-border">
              Query 1
            </div>
          </div>

          {/* ツールバープレースホルダー（36px） */}
          <div className="flex h-[36px] shrink-0 items-center gap-2 border-b border-border bg-panel-muted px-3">
            {/* Run ボタン（無効状態 — Monaco 接続後に有効化） */}
            <button
              type="button"
              disabled
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground opacity-50"
            >
              実行
            </button>
            {/* Explain ボタン */}
            <button
              type="button"
              disabled
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground opacity-50"
            >
              実行計画
            </button>
            {/* Format ボタン */}
            <button
              type="button"
              disabled
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground opacity-50"
            >
              整形
            </button>
            {/* Stop ボタン */}
            <button
              type="button"
              disabled
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground opacity-50"
            >
              中断
            </button>
          </div>

          {/* エディター/結果エリア — react-resizable-panels で縦分割 */}
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* エディターエリア（flex-1） */}
            <ResizablePanel defaultSize={60} minSize={20}>
              <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
                最初のクエリを書いてください
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* 結果エリア（min-h 120px） */}
            <ResizablePanel defaultSize={40} minSize={15}>
              <div className="flex h-full min-h-[120px] items-center justify-center bg-background text-sm text-muted-foreground">
                クエリを実行すると結果がここに表示されます
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
