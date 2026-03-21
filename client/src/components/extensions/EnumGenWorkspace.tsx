// 列挙型コード生成ワークスペース
//
// Excel シートから Java / TypeScript の enum コードを生成する。
// 左ペイン: 設定（シート選択・言語・パッケージ名）
// 右ペイン: リアルタイムプレビュー

import { useState } from "react";
import { Loader2, Download, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSheets } from "@/hooks/use-ddl";
import { useEnumGenPreview, useEnumGenExport } from "@/hooks/use-ddl";
import { useToast } from "@/hooks/use-toast";
import type { EnumGenRequest } from "@shared/schema";

// ──────────────────────────────────────────────
// Props 型
// ──────────────────────────────────────────────

interface EnumGenWorkspaceProps {
  fileId: number;
  fileName: string;
}

// ──────────────────────────────────────────────
// コンポーネント本体
// ──────────────────────────────────────────────

export function EnumGenWorkspace({ fileId, fileName }: EnumGenWorkspaceProps) {
  const { toast } = useToast();

  // ── 設定ステート ────────────────────────────
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [targetLang, setTargetLang] = useState<"java" | "typescript">("java");
  const [packageName, setPackageName] = useState<string>("com.example.enums");

  // ── データ取得 ──────────────────────────────

  // シート一覧
  const { data: sheets = [], isLoading: isSheetsLoading } = useSheets(fileId);

  // プレビュー: シートが選択されている場合のみ実行
  const previewRequest: EnumGenRequest | null =
    selectedSheet
      ? {
          fileId,
          sheetName: selectedSheet,
          targetLang,
          packageName: targetLang === "java" ? packageName : undefined,
        }
      : null;

  const {
    data: preview,
    isLoading: isPreviewLoading,
    error: previewError,
  } = useEnumGenPreview(previewRequest);

  // ダウンロード mutation
  const { mutate: exportEnum, isPending: isExporting } = useEnumGenExport();

  // ── ハンドラー ──────────────────────────────

  const handleDownload = () => {
    if (!previewRequest) return;
    exportEnum(previewRequest, {
      onSuccess: (result) => {
        toast({
          title: "ダウンロード完了",
          description: `${result.successCount} クラス生成、${result.skippedCount} スキップ`,
          variant: "success",
        });
      },
      onError: (error) => {
        toast({
          title: "エクスポート失敗",
          description: String(error),
          variant: "destructive",
        });
      },
    });
  };

  // ── レンダリング ────────────────────────────

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* ── 左ペイン: 設定 ── */}
      <div className="flex w-[240px] shrink-0 flex-col gap-4 border-r border-border bg-background p-4">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Excel → 枚举代码生成器
          </h2>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {fileName}
          </p>
        </div>

        {/* シート選択 */}
        <div className="space-y-1.5">
          <Label className="text-xs">工作表</Label>
          {isSheetsLoading ? (
            <div className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载中...
            </div>
          ) : (
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择工作表..." />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((sheet) => (
                  <SelectItem
                    key={sheet.name}
                    value={sheet.name}
                    className="text-xs"
                  >
                    {sheet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* 目標言語 */}
        <div className="space-y-1.5">
          <Label className="text-xs">目标语言</Label>
          <div className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="targetLang"
                value="java"
                checked={targetLang === "java"}
                onChange={() => setTargetLang("java")}
                className="accent-primary"
              />
              Java
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="targetLang"
                value="typescript"
                checked={targetLang === "typescript"}
                onChange={() => setTargetLang("typescript")}
                className="accent-primary"
              />
              TypeScript
            </label>
          </div>
        </div>

        {/* パッケージ名（Java のみ） */}
        {targetLang === "java" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">包名（Java）</Label>
            <Input
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="com.example.enums"
              className="h-8 text-xs font-mono"
            />
          </div>
        ) : null}

        {/* ダウンロードボタン */}
        <div className="mt-auto">
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={handleDownload}
            disabled={!selectedSheet || !preview || isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            下载生成代码
          </Button>
        </div>
      </div>

      {/* ── 右ペイン: プレビュー ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {/* プレビューヘッダー */}
        <div className="shrink-0 border-b border-border bg-background px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">预览</span>
            {preview ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                检测到 {preview.enums.length} 个枚举类
              </Badge>
            ) : null}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* 空の状態 */}
            {!selectedSheet ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <ChevronDown className="mb-3 h-8 w-8 opacity-30" />
                <p className="text-sm">请在左侧选择工作表</p>
                <p className="mt-1 text-xs opacity-70">选择后将自动生成预览</p>
              </div>
            ) : isPreviewLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mb-3 h-6 w-6 animate-spin" />
                <p className="text-sm">解析中...</p>
              </div>
            ) : previewError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-destructive">解析失败</p>
                    <p className="mt-1 text-xs text-muted-foreground break-all">
                      {String(previewError)}
                    </p>
                  </div>
                </div>
              </div>
            ) : preview ? (
              <>
                {/* 列挙クラス一覧 */}
                {preview.enums.length > 0 ? (
                  <div className="space-y-3">
                    {preview.enums.map((enumClass) => (
                      <div
                        key={enumClass.className}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <p className="mb-2 text-xs font-semibold text-foreground">
                          {enumClass.className}
                          <span className="ml-2 font-normal text-muted-foreground">
                            ({enumClass.constants.length}个常量)
                          </span>
                        </p>
                        <div className="space-y-0.5">
                          {enumClass.constants.map((constant, i) => (
                            <div
                              key={`${constant.name}-${i}`}
                              className="flex items-baseline gap-1.5 text-[11px] font-mono text-muted-foreground"
                            >
                              <span className="text-foreground/70">
                                {i < enumClass.constants.length - 1 ? "├" : "└"}
                              </span>
                              <span className="text-foreground">{constant.name}</span>
                              <span>=</span>
                              <span className="text-amber-600 dark:text-amber-400">
                                "{constant.value}"
                              </span>
                              {constant.label ? (
                                <span className="text-muted-foreground/70">
                                  {constant.label}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    该工作表中未检测到枚举类
                  </div>
                )}

                {/* 警告 */}
                {preview.warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      警告
                    </p>
                    <ul className="space-y-0.5">
                      {preview.warnings.map((warn, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground">
                          • {warn}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* 生成されたコード */}
                {preview.code ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground">生成代码</p>
                    <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] font-mono text-foreground/80 leading-relaxed">
                      {preview.code}
                    </pre>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
