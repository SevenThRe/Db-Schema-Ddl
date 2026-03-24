// DB 工作台 — 左サイドバー: 接続セレクター + 環境インジケーター
//
// 現在アクティブな接続情報（名前・環境・ドライバー・読み取り専用）を表示し、
// 接続切替ドロップダウンを提供する。
// Phase 2 の object tree はこのサイドバーの下部エリアに配置予定。

import { useState } from "react";
import { Lock, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig, DbEnvironment } from "@shared/schema";

// ──────────────────────────────────────────────
// 環境設定定数
// ──────────────────────────────────────────────

/** 環境ごとのドット色 CSS クラス（Plan 02 で定義した CSS 変数を使用） */
const ENV_DOT_CLASS: Record<DbEnvironment, string> = {
  prod: "bg-[hsl(var(--env-prod))]",
  test: "bg-[hsl(var(--env-test))]",
  dev: "bg-[hsl(var(--env-dev))]",
};

/** 環境ラベルの文字色 CSS クラス */
const ENV_TEXT_CLASS: Record<DbEnvironment, string> = {
  prod: "text-[hsl(var(--env-prod))]",
  test: "text-[hsl(var(--env-test))]",
  dev: "text-[hsl(var(--env-dev))]",
};

/** ドライバー表示名マッピング */
const DRIVER_LABEL: Record<string, string> = {
  mysql: "MySQL",
  postgres: "PostgreSQL",
};

// ──────────────────────────────────────────────
// 環境インジケータードット
// ──────────────────────────────────────────────

function EnvDot({
  environment,
}: {
  environment: DbEnvironment | undefined;
}) {
  if (!environment) return null;

  return (
    <div
      className={cn("h-2 w-2 shrink-0 rounded-full", ENV_DOT_CLASS[environment])}
      aria-label={`Environment: ${environment}`}
    />
  );
}

// ──────────────────────────────────────────────
// プロップ型
// ──────────────────────────────────────────────

export interface ConnectionSidebarProps {
  /** 現在アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** 切替先として表示する全接続リスト */
  connections: DbConnectionConfig[];
  /** 接続切替コールバック */
  onSwitchConnection: (id: string) => void;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * DB 工作台 左サイドバー
 *
 * アクティブ接続の名前・環境色ドット・読み取り専用アイコン・ドライバーバッジを表示し、
 * 接続切替ドロップダウンを提供する。
 * Phase 2 では下部に object tree が追加される（スペース確保済み）。
 */
export function ConnectionSidebar({
  connection,
  connections,
  onSwitchConnection,
}: ConnectionSidebarProps) {
  // 接続切替ドロップダウンの開閉状態
  const [switchOpen, setSwitchOpen] = useState(false);

  const env = connection.environment;
  const driverLabel = DRIVER_LABEL[connection.driver] ?? connection.driver;

  return (
    <div className="flex h-full w-[200px] min-w-[200px] flex-col gap-2 border-r border-border bg-sidebar p-2">
      {/* アクティブ接続情報エリア */}
      <div className="flex flex-col gap-1">
        {/* 接続名 + 環境ドット + 読み取り専用アイコン */}
        <div className="flex items-center gap-1.5">
          <EnvDot environment={env} />
          <span className="max-w-[140px] truncate text-xs font-semibold text-sidebar-foreground">
            {connection.name || connection.database}
          </span>
          {/* 読み取り専用接続はロックアイコンを表示 */}
          {connection.readonly && (
            <Lock
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-label="Read-only connection"
            />
          )}
        </div>

        {/* 環境ラベル + ドライバーバッジ（サブ情報） */}
        <div className="flex items-center gap-1.5">
          {env && (
            <span
              className={cn(
                "text-[10px] font-semibold uppercase",
                ENV_TEXT_CLASS[env],
              )}
            >
              {env}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{driverLabel}</span>
        </div>

        {/* データベース名 */}
        <span className="truncate text-xs text-muted-foreground">
          {connection.database}
        </span>
      </div>

      <Separator />

      {/* 接続切替トリガー */}
      <button
        type="button"
        className="flex items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setSwitchOpen((prev) => !prev)}
        aria-expanded={switchOpen}
      >
        <span>Switch connection</span>
        <ChevronDown
          size={12}
          className={cn("transition-transform", switchOpen && "rotate-180")}
        />
      </button>

      {/* 接続リストドロップダウン */}
      {switchOpen && (
        <ScrollArea className="max-h-[200px] rounded-md border border-border bg-background">
          <div className="flex flex-col py-1">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  conn.id === connection.id && "bg-muted font-semibold",
                )}
                onClick={() => {
                  onSwitchConnection(conn.id);
                  setSwitchOpen(false);
                }}
              >
                {/* 接続ごとの環境ドット */}
                <EnvDot environment={conn.environment} />
                <span className="flex-1 truncate">{conn.name || conn.database}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {DRIVER_LABEL[conn.driver] ?? conn.driver}
                </span>
              </button>
            ))}
            {connections.length === 0 && (
              <span className="px-2 py-1.5 text-xs text-muted-foreground">
                No connections saved
              </span>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Phase 2 プレースホルダー: object tree エリア */}
      <div className="flex-1" aria-hidden="true" />
    </div>
  );
}
