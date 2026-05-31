import { useCallback, useEffect, useRef } from "react";
import type { OnMount } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import type { DbDriver } from "@shared/schema";
import type { SqlAutocompleteContext } from "./sql-autocomplete";
import { formatSqlText, isExplainQuery } from "./sql-editor-validation";
import {
  applySqlEditorValidationMarkers,
  registerSqlCompletionAcceptanceCommand,
  registerSqlEditorAutocompleteProvider,
  registerSqlEditorHoverProvider,
} from "./sql-editor-monaco-runtime";
import type { SqlMemoryAcceptedSuggestionInput } from "./sql-memory";

export interface UseSqlEditorPaneRuntimeInput {
  sql: string;
  dialect: DbDriver;
  autocompleteContext: SqlAutocompleteContext;
  onCompletionAccepted?: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
  onExecuteSelection: (sql: string, cursorOffset?: number) => void;
  onExecuteScript: (sql: string) => void;
  onExplain: (sql: string) => void;
  onCloseTab?: () => void;
}

export interface SqlEditorPaneRuntime {
  handleExecuteSelection: () => void;
  handleExecuteScript: () => void;
  handleExplain: () => void;
  handleFormatSql: () => void;
  handleMount: OnMount;
}

export function useSqlEditorPaneRuntime({
  sql,
  dialect,
  autocompleteContext,
  onCompletionAccepted,
  onExecuteSelection,
  onExecuteScript,
  onExplain,
  onCloseTab,
}: UseSqlEditorPaneRuntimeInput): SqlEditorPaneRuntime {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const completionProviderRef = useRef<IDisposable | null>(null);
  const hoverProviderRef = useRef<IDisposable | null>(null);
  const completionCommandRef = useRef<IDisposable | null>(null);

  const handleExecuteSelection = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const selection = editorInstance.getSelection();
    const model = editorInstance.getModel();
    if (!model) return;

    const selectedText = selection ? model.getValueInRange(selection) : "";
    if (selectedText.trim()) {
      if (isExplainQuery(selectedText)) {
        onExplain(selectedText);
      } else {
        onExecuteSelection(selectedText);
      }
      return;
    }

    const fullSql = model.getValue();
    const position = editorInstance.getPosition();
    const cursorOffset = position ? model.getOffsetAt(position) : undefined;

    if (isExplainQuery(fullSql)) {
      onExplain(fullSql);
    } else {
      onExecuteSelection(fullSql, cursorOffset);
    }
  }, [onExecuteSelection, onExplain]);

  const handleExecuteScript = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    onExecuteScript(model.getValue());
  }, [onExecuteScript]);

  const handleFormatSql = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const selection = editorInstance.getSelection();
    const selectedText = selection ? model.getValueInRange(selection) : "";

    try {
      if (selectedText.trim() && selection) {
        const formatted = formatSqlText(selectedText, dialect);
        editorInstance.executeEdits("format-sql", [{ range: selection, text: formatted }]);
      } else {
        const formatted = formatSqlText(model.getValue(), dialect);
        editorInstance.executeEdits("format-sql", [
          { range: model.getFullModelRange(), text: formatted },
        ]);
      }
    } catch {
      // sql-formatter can reject partial vendor-specific SQL; keep the editor unchanged.
    }
  }, [dialect]);

  const handleExplain = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const selection = editorInstance.getSelection();
    const selectedText = selection ? model.getValueInRange(selection) : "";
    onExplain(selectedText.trim() ? selectedText : model.getValue());
  }, [onExplain]);

  const applyValidationMarkers = useCallback(
    (text: string) => {
      const editorInstance = editorRef.current;
      const monacoInstance = monacoRef.current;
      if (!editorInstance || !monacoInstance) return;

      applySqlEditorValidationMarkers({
        editorInstance,
        monacoInstance,
        text,
        dialect,
        autocompleteContext,
      });
    },
    [autocompleteContext, dialect],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      applyValidationMarkers(sql);
    }, 160);

    return () => window.clearTimeout(timer);
  }, [applyValidationMarkers, sql]);

  const registerAutocompleteProvider = useCallback(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance) return;

    completionProviderRef.current?.dispose();
    completionProviderRef.current = registerSqlEditorAutocompleteProvider({
      monacoInstance,
      autocompleteContext,
      onCompletionAccepted,
    });
  }, [autocompleteContext, onCompletionAccepted]);

  const registerCompletionAcceptanceCommand = useCallback(() => {
    const monacoInstance = monacoRef.current;
    completionCommandRef.current?.dispose();
    completionCommandRef.current = null;
    if (!monacoInstance || !onCompletionAccepted) return;

    completionCommandRef.current = registerSqlCompletionAcceptanceCommand({
      monacoInstance,
      onCompletionAccepted,
    });
  }, [onCompletionAccepted]);

  const registerHoverProvider = useCallback(() => {
    const monacoInstance = monacoRef.current;
    if (!monacoInstance) return;

    hoverProviderRef.current?.dispose();
    hoverProviderRef.current = registerSqlEditorHoverProvider({
      monacoInstance,
      autocompleteContext,
    });
  }, [autocompleteContext]);

  useEffect(() => {
    registerAutocompleteProvider();
    registerHoverProvider();
    registerCompletionAcceptanceCommand();
    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
      hoverProviderRef.current?.dispose();
      hoverProviderRef.current = null;
      completionCommandRef.current?.dispose();
      completionCommandRef.current = null;
    };
  }, [registerAutocompleteProvider, registerCompletionAcceptanceCommand, registerHoverProvider]);

  const handleMount: OnMount = useCallback(
    (editorInstance, monacoInstance) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;
      registerAutocompleteProvider();
      registerHoverProvider();
      registerCompletionAcceptanceCommand();

      const { KeyMod, KeyCode } = monacoInstance;

      editorInstance.addAction({
        id: "db-execute-selection",
        label: "Execute Selection / Statement",
        keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
        run: () => handleExecuteSelection(),
      });
      editorInstance.addAction({
        id: "db-execute-script",
        label: "Execute Full Script",
        keybindings: [KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Enter],
        run: () => handleExecuteScript(),
      });
      editorInstance.addAction({
        id: "db-format-sql",
        label: "Format SQL",
        keybindings: [KeyMod.Alt | KeyMod.Shift | KeyCode.KeyF],
        run: () => handleFormatSql(),
      });
      editorInstance.addAction({
        id: "db-close-tab",
        label: "Close Tab",
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyW],
        run: () => onCloseTab?.(),
      });

      applyValidationMarkers(editorInstance.getValue());
    },
    [
      applyValidationMarkers,
      handleExecuteSelection,
      handleExecuteScript,
      handleFormatSql,
      onCloseTab,
      registerAutocompleteProvider,
      registerCompletionAcceptanceCommand,
      registerHoverProvider,
    ],
  );

  return {
    handleExecuteSelection,
    handleExecuteScript,
    handleExplain,
    handleFormatSql,
    handleMount,
  };
}
