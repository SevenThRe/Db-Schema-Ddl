// DangerousSqlDialog — 危険な SQL 実行確認ダイアログ
//
// 機能（D-08 / D-09 / D-10 / SAFE-01 / SAFE-02）:
//   - dev/test 接続: 操作の詳細を表示 → "Run anyway" で実行確認
//   - prod 接続: データベース名の入力を要求 → 一致した場合のみ確認ボタンを有効化
//   - 危険クラスをバッジで表示
//   - キャンセルボタン "Keep editing" で操作を取り消し

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { DangerousSqlPreview, DangerClass } from "@shared/schema";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface DangerousSqlDialogProps {
  /** 危険 SQL プレビュー情報（null の場合はダイアログ非表示） */
  preview: DangerousSqlPreview | null;
  /** ダイアログ表示フラグ */
  open: boolean;
  /** ユーザーが実行を確認したときのコールバック */
  onConfirm: () => void;
  /** ユーザーがキャンセルしたときのコールバック */
  onCancel: () => void;
}

// ──────────────────────────────────────────────
// 危険クラスのラベルマッピング
// ──────────────────────────────────────────────

const DANGER_CLASS_LABELS: Record<DangerClass, string> = {
  DROP: "DROP",
  TRUNCATE: "TRUNCATE",
  ALTER_TABLE: "ALTER TABLE",
  ALTER_DATABASE: "ALTER DATABASE",
  DELETE_WITHOUT_WHERE: "DELETE without WHERE",
  UPDATE_WITHOUT_WHERE: "UPDATE without WHERE",
};

/** 危険クラスの配列をカンマ区切りのラベル文字列に変換する */
function formatDangerClasses(dangers: DangerClass[]): string {
  return dangers.map((d) => DANGER_CLASS_LABELS[d]).join(", ");
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * DangerousSqlDialog — 危険な SQL 実行前の確認ダイアログ
 *
 * prod 接続の場合はデータベース名の入力を要求する（D-10）。
 * dev/test 接続の場合は操作内容を表示するだけで確認できる（D-09）。
 */
export function DangerousSqlDialog({
  preview,
  open,
  onConfirm,
  onCancel,
}: DangerousSqlDialogProps) {
  // prod 接続の場合のデータベース名入力値
  const [dbNameInput, setDbNameInput] = useState("");

  const isProd = preview?.environment === "prod";

  // prod ダイアログ: 入力値がデータベース名と一致した場合のみ確認ボタンを有効化
  const isConfirmEnabled = isProd
    ? dbNameInput === preview?.database
    : true;

  // ダイアログが閉じる際に入力値をリセット
  const handleCancel = () => {
    setDbNameInput("");
    onCancel();
  };

  const handleConfirm = () => {
    setDbNameInput("");
    onConfirm();
  };

  if (!preview) return null;

  const dangerLabel = formatDangerClasses(preview.dangers);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          {isProd ? (
            // prod 接続: 本番確認タイトル（D-10）
            <DialogTitle className="text-destructive">
              Confirm on production
            </DialogTitle>
          ) : (
            // dev/test 接続: 破壊的操作確認タイトル（D-09）
            <DialogTitle className="text-destructive">
              Confirm destructive operation
            </DialogTitle>
          )}

          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              {isProd ? (
                // prod ダイアログ本文（D-10）
                <p className="text-sm text-foreground">
                  Type{" "}
                  <strong className="font-semibold">{preview.database}</strong>{" "}
                  to confirm this operation on the{" "}
                  <strong className="font-semibold">
                    {preview.connectionName}
                  </strong>{" "}
                  production database.
                </p>
              ) : (
                // dev/test ダイアログ本文（D-09）
                <p className="text-sm text-foreground">
                  This will run{" "}
                  <strong className="font-semibold">{dangerLabel}</strong> on{" "}
                  <strong className="font-semibold">
                    {preview.connectionName}
                  </strong>{" "}
                  ({preview.environment}) /{" "}
                  <strong className="font-semibold">{preview.database}</strong>.
                </p>
              )}

              {/* 危険クラスバッジ */}
              <div className="flex flex-wrap gap-1">
                {preview.dangers.map((d) => (
                  <Badge key={d} variant="destructive" className="text-xs">
                    {DANGER_CLASS_LABELS[d]}
                  </Badge>
                ))}
              </div>

              {/* SQL 表示 */}
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                {preview.sql}
              </pre>

              {/* prod: データベース名入力フィールド（D-10） */}
              {isProd && (
                <Input
                  value={dbNameInput}
                  onChange={(e) => setDbNameInput(e.target.value)}
                  placeholder="Database name"
                  className="text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    // Enter キーで確認（入力値が一致している場合のみ）
                    if (e.key === "Enter" && isConfirmEnabled) {
                      handleConfirm();
                    }
                  }}
                />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          {/* キャンセルボタン */}
          <Button variant="outline" onClick={handleCancel}>
            Keep editing
          </Button>

          {isProd ? (
            // prod 確認ボタン（D-10）
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!isConfirmEnabled}
            >
              Confirm and run
            </Button>
          ) : (
            // dev/test 確認ボタン（D-09）
            <Button variant="destructive" onClick={handleConfirm}>
              Run anyway
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
