import Editor from "@monaco-editor/react";
import type { DbDriver } from "@shared/schema";
import type { SqlAutocompleteContext } from "./sql-autocomplete";
import { useSqlEditorPaneRuntime } from "./sql-editor-pane-runtime";
import { SqlEditorToolbar } from "./sql-editor-toolbar";
import type { SqlMemoryAcceptedSuggestionInput } from "./sql-memory";

export interface SqlEditorPaneProps {
  sql: string;
  dialect: DbDriver;
  autocompleteContext: SqlAutocompleteContext;
  onCompletionAccepted?: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
  onSqlChange: (sql: string) => void;
  onExecuteSelection: (sql: string, cursorOffset?: number) => void;
  onExecuteScript: (sql: string) => void;
  onExplain: (sql: string) => void;
  onCancel: () => void;
  onCloseTab?: () => void;
  isExecuting: boolean;
}

export function SqlEditorPane({
  sql,
  dialect,
  autocompleteContext,
  onCompletionAccepted,
  onSqlChange,
  onExecuteSelection,
  onExecuteScript,
  onExplain,
  onCancel,
  onCloseTab,
  isExecuting,
}: SqlEditorPaneProps) {
  const {
    handleExecuteSelection,
    handleExecuteScript,
    handleExplain,
    handleFormatSql,
    handleMount,
  } = useSqlEditorPaneRuntime({
    sql,
    dialect,
    autocompleteContext,
    onCompletionAccepted,
    onExecuteSelection,
    onExecuteScript,
    onExplain,
    onCloseTab,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SqlEditorToolbar
        isExecuting={isExecuting}
        onExecuteSelection={handleExecuteSelection}
        onExecuteScript={handleExecuteScript}
        onExplain={handleExplain}
        onFormatSql={handleFormatSql}
        onCancel={onCancel}
      />

      <div className="min-h-0 flex-1">
        <Editor
          language="sql"
          value={sql}
          onChange={(value) => onSqlChange(value ?? "")}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            wordWrap: "on",
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            folding: true,
            contextmenu: true,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
