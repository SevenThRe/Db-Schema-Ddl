// ResultGridPane — 仮想スクロール付き結果グリッド
//
// 機能:
//   - react-window FixedSizeList による仮想スクロール（32px 行高固定）
//   - スティッキーカラムヘッダー（FixedSizeList の外側に配置）
//   - カラム幅ドラッグリサイズ（マウスイベントによる）
//   - マルチバッチタブ（複数ステートメントの結果を切り替え）
//   - ロードモアボタン（D-06: 1000行超の場合）
//   - Stop on error トグル（D-05）
//   - DML結果表示（affected rows）
//   - エラー状態表示

import { useState, useRef, useCallback, useEffect } from "react";
// react-window v2 は FixedSizeList を廃止し List + rowComponent パターンに変更
// ListProps の型引数 RowProps を明示的に {} にするためインポート時も型を使用
import { List, type ListProps } from "react-window";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DbQueryBatchResult, DbQueryColumn } from "@shared/schema";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface ResultGridPaneProps {
  /** 実行結果バッチ一覧（マルチステートメント対応） */
  batches: DbQueryBatchResult[];
  /** ロードモアボタン押下時のコールバック（batchIndex を渡す） */
  onLoadMore: (batchIndex: number) => void;
  /** クエリ実行中フラグ */
  isLoading: boolean;
  /** Stop on error 変更コールバック */
  onStopOnErrorChange: (value: boolean) => void;
}

// デフォルトカラム幅計算（文字数ベース、min 60px / max 300px）
function calcDefaultColumnWidth(col: DbQueryColumn): number {
  const nameLen = col.name.length;
  const typeLen = col.dataType?.length ?? 0;
  const estimated = Math.max(nameLen, typeLen) * 8 + 24;
  return Math.min(300, Math.max(60, estimated));
}

// ──────────────────────────────────────────────
// バッチタブコンポーネント
// ──────────────────────────────────────────────

function BatchTabs({
  batches,
  activeIndex,
  onSelect,
}: {
  batches: DbQueryBatchResult[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  if (batches.length <= 1) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-panel-muted px-2 py-1">
      {batches.map((batch, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs transition-colors",
            i === activeIndex
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {/* エラーステートメントにはエラーアイコンを表示 */}
          {batch.error ? (
            <XCircle className="h-3 w-3 text-destructive" />
          ) : null}
          <span>Statement {i + 1}</span>
          {/* 経過時間バッジ */}
          <span className="text-[10px] text-muted-foreground">
            {batch.elapsedMs}ms
          </span>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// 単一バッチグリッドコンポーネント
// ──────────────────────────────────────────────

function SingleBatchGrid({
  batch,
  batchIndex,
  onLoadMore,
}: {
  batch: DbQueryBatchResult;
  batchIndex: number;
  onLoadMore: (batchIndex: number) => void;
}) {
  // カラム幅状態（各カラムのピクセル幅）
  const [columnWidths, setColumnWidths] = useState<number[]>(() =>
    batch.columns.map(calcDefaultColumnWidth),
  );

  // コンテナサイズ（ResizeObserver で計測）
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 選択行インデックス
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  // ドラッグリサイズ状態
  const dragState = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  // ResizeObserver でコンテナサイズを計測（Pitfall 5: 数値で渡す必要がある）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // カラムヘッダードラッグ開始
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, colIndex: number) => {
      e.preventDefault();
      dragState.current = {
        colIndex,
        startX: e.clientX,
        startWidth: columnWidths[colIndex],
      };

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragState.current) return;
        const delta = me.clientX - dragState.current.startX;
        const newWidth = Math.min(
          300,
          Math.max(60, dragState.current.startWidth + delta),
        );
        setColumnWidths((prev) => {
          const next = [...prev];
          next[dragState.current!.colIndex] = newWidth;
          return next;
        });
      };

      const handleMouseUp = () => {
        dragState.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnWidths],
  );

  // カラム幅変更時にリセット
  useEffect(() => {
    setColumnWidths(batch.columns.map(calcDefaultColumnWidth));
  }, [batch.columns]);

  // エラーバッチの表示
  if (batch.error) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-destructive">Query failed</p>
        <p className="text-xs text-destructive">{batch.error}</p>
        <p className="text-xs text-muted-foreground">
          Edit your query and try again.
        </p>
      </div>
    );
  }

  // DML結果（行なし）
  if (batch.columns.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="text-xs text-muted-foreground">
          {batch.affectedRows ?? 0} rows affected ({batch.elapsedMs}ms)
        </span>
      </div>
    );
  }

  // ヘッダー行の合計幅
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  // react-window v2 List 用の rowComponent（RowProps={} で型推論を明確化）
  const RowRenderer: ListProps<Record<string, never>>["rowComponent"] = ({
    index,
    style,
  }) => {
    const row = batch.rows[index];
    const isSelected = selectedRow === index;

    return (
      <div
        style={style}
        className={cn(
          "flex cursor-pointer items-center border-b border-border",
          isSelected ? "bg-primary/10" : "hover:bg-muted/40",
        )}
        onClick={() => setSelectedRow(index)}
      >
        {batch.columns.map((col, colIdx) => {
          const value = row.values[colIdx];
          const isNull = value === null;
          const displayVal = isNull ? "null" : String(value);

          return (
            <TooltipProvider key={col.name} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="shrink-0 overflow-hidden border-r border-border px-2"
                    style={{ width: columnWidths[colIdx], height: 32 }}
                  >
                    <span
                      className={cn(
                        "block truncate text-xs font-mono leading-8",
                        isNull
                          ? "text-muted-foreground italic"
                          : "text-foreground",
                      )}
                    >
                      {displayVal}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs break-all font-mono text-xs">
                    {displayVal}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };

  // ロードモアボタンの表示条件（D-06: totalRows > 読み込み済み行数）
  const loadedCount = batch.rows.length;
  const totalRows = batch.totalRows;
  const remaining = totalRows - loadedCount;
  const hasMore = remaining > 0;
  const loadMoreCount = Math.min(1000, remaining);

  // グリッドコンテンツの高さ（ヘッダー 28px + ステータス行 32px 分を除く）
  const headerHeight = 28;
  const statusHeight = 36;
  const gridHeight = Math.max(
    64,
    containerSize.height - headerHeight - statusHeight,
  );

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* スティッキーカラムヘッダー（FixedSizeList の外側） */}
      <div
        className="flex shrink-0 overflow-hidden border-b border-border bg-panel-muted"
        style={{ height: headerHeight, minWidth: totalWidth }}
      >
        {batch.columns.map((col, colIdx) => (
          <div
            key={col.name}
            className="relative shrink-0 border-r border-border px-2"
            style={{ width: columnWidths[colIdx], height: headerHeight }}
          >
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block truncate text-xs font-semibold leading-7 text-foreground">
                    {col.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {col.name} — {col.dataType}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* リサイズハンドル（右端に 2px の細い div） */}
            <div
              className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-primary/50"
              onMouseDown={(e) => handleResizeMouseDown(e, colIdx)}
            />
          </div>
        ))}
      </div>

      {/* 仮想スクロールリスト（react-window v2 List + rowComponent） */}
      <div className="flex-1 overflow-hidden">
        {containerSize.height > 0 && (
          <List<Record<string, never>>
            rowCount={batch.rows.length}
            rowHeight={32}
            rowComponent={RowRenderer}
            rowProps={{}}
            defaultHeight={gridHeight}
            style={{ width: Math.max(totalWidth, containerSize.width) }}
          />
        )}
      </div>

      {/* ステータス行 + ロードモアボタン */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-panel-muted px-3 py-1">
        {hasMore ? (
          <>
            <span className="text-xs text-muted-foreground">
              {loadedCount.toLocaleString()} / {totalRows.toLocaleString()} rows
              loaded
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onLoadMore(batchIndex)}
            >
              Load {loadMoreCount.toLocaleString()} more rows
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {batch.rows.length.toLocaleString()} rows ({batch.elapsedMs}ms)
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

/**
 * ResultGridPane — クエリ結果グリッドパネル
 *
 * マルチバッチタブ + 仮想スクロールグリッド + ロードモア + Stop on error トグル
 */
export function ResultGridPane({
  batches,
  onLoadMore,
  isLoading,
  onStopOnErrorChange,
}: ResultGridPaneProps) {
  // アクティブバッチのインデックス
  const [activeIndex, setActiveIndex] = useState(0);

  // Stop on error トグル状態（D-05: デフォルト ON）
  const [stopOnError, setStopOnError] = useState(true);

  // バッチ変更時に最初のバッチを選択
  useEffect(() => {
    if (activeIndex >= batches.length && batches.length > 0) {
      setActiveIndex(batches.length - 1);
    }
  }, [batches.length, activeIndex]);

  // トグル変更をコールバックに伝播
  const handleStopOnErrorChange = (value: boolean) => {
    setStopOnError(value);
    onStopOnErrorChange(value);
  };

  // ローディング状態
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">Running...</span>
      </div>
    );
  }

  // 空状態（バッチなし）
  if (batches.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-muted-foreground">
            Run a query to see results here.
          </span>
        </div>
        {/* Stop on error トグルは常に表示 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel-muted px-3 py-1">
          <Switch
            id="stop-on-error"
            checked={stopOnError}
            onCheckedChange={handleStopOnErrorChange}
          />
          <Label htmlFor="stop-on-error" className="cursor-pointer text-xs">
            Stop on error
          </Label>
        </div>
      </div>
    );
  }

  const activeBatch = batches[Math.min(activeIndex, batches.length - 1)];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* マルチバッチタブ（2つ以上の場合のみ表示） */}
      <BatchTabs
        batches={batches}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />

      {/* アクティブバッチのグリッド */}
      <div className="flex-1 overflow-hidden">
        <SingleBatchGrid
          batch={activeBatch}
          batchIndex={activeIndex}
          onLoadMore={onLoadMore}
        />
      </div>

      {/* Stop on error トグル（グリッド下部） */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel-muted px-3 py-1">
        <Switch
          id="stop-on-error"
          checked={stopOnError}
          onCheckedChange={handleStopOnErrorChange}
        />
        <Label htmlFor="stop-on-error" className="cursor-pointer text-xs">
          Stop on error
        </Label>
      </div>
    </div>
  );
}
