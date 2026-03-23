/**
 * Monaco Editor ベースの DDL 差分ビューア
 *
 * VS Code と同等の code diff 体験を提供する。
 * サイドバイサイド / インライン切替、行番号、トークンハイライト、
 * 折りたたみ、選択コピーが標準で利用可能。
 */

import { memo, useRef, useCallback } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

export interface MonacoDdlDiffProps {
  oldValue: string;
  newValue: string;
  /** サイドバイサイド表示（false でインライン） */
  sideBySide?: boolean;
  /** エディタの高さ（CSS値、デフォルト: 100%） */
  height?: string | number;
  className?: string;
}

export const MonacoDdlDiff = memo(function MonacoDdlDiff({
  oldValue,
  newValue,
  sideBySide = true,
  height = "100%",
  className,
}: MonacoDdlDiffProps) {
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const handleMount: DiffOnMount = useCallback((editor) => {
    diffEditorRef.current = editor;
  }, []);

  return (
    <div className={className} style={{ height: typeof height === "number" ? `${height}px` : height }}>
      <DiffEditor
        original={oldValue}
        modified={newValue}
        language="sql"
        theme="vs-dark"
        onMount={handleMount}
        options={{
          readOnly: true,
          renderSideBySide: sideBySide,
          minimap: { enabled: false },
          wordWrap: "off",
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineHeight: 18,
          renderIndicators: true,
          enableSplitViewResizing: true,
          ignoreTrimWhitespace: false,
          renderOverviewRuler: false,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 8, bottom: 8 },
          glyphMargin: false,
          folding: true,
          lineNumbers: "on",
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          contextmenu: false,
        }}
      />
    </div>
  );
});
