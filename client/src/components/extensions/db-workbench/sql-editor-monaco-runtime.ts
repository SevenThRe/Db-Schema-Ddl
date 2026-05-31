import type { editor, languages, IDisposable } from "monaco-editor";
import type { DbDriver } from "@shared/schema";
import {
  buildCompletionItems,
  resolveTableAlias,
  resolveSemanticHoverSymbol,
  type SqlAutocompleteContext,
  type SqlCompletionKind,
} from "./sql-autocomplete";
import {
  collectFormatterIssue,
  collectLexicalIssues,
  offsetToMarkerRange,
} from "./sql-editor-validation";
import { collectSemanticDiagnostics } from "./sql-semantic-context";
import type { SqlMemoryAcceptedSuggestionInput } from "./sql-memory";

export const COMPLETION_ACCEPT_COMMAND_ID = "db-workbench.record-completion-acceptance";

function mapCompletionKind(
  monacoInstance: typeof import("monaco-editor"),
  kind: SqlCompletionKind,
): languages.CompletionItemKind {
  switch (kind) {
    case "function":
      return monacoInstance.languages.CompletionItemKind.Function;
    case "type":
      return monacoInstance.languages.CompletionItemKind.TypeParameter;
    case "keyword":
      return monacoInstance.languages.CompletionItemKind.Keyword;
    case "template":
      return monacoInstance.languages.CompletionItemKind.Snippet;
    case "schema":
      return monacoInstance.languages.CompletionItemKind.Module;
    case "table":
      return monacoInstance.languages.CompletionItemKind.Struct;
    case "view":
      return monacoInstance.languages.CompletionItemKind.Interface;
    case "column":
    default:
      return monacoInstance.languages.CompletionItemKind.Field;
  }
}

export function applySqlEditorValidationMarkers({
  editorInstance,
  monacoInstance,
  text,
  dialect,
  autocompleteContext,
}: {
  editorInstance: editor.IStandaloneCodeEditor;
  monacoInstance: typeof import("monaco-editor");
  text: string;
  dialect: DbDriver;
  autocompleteContext: SqlAutocompleteContext;
}) {
  const model = editorInstance.getModel();
  if (!model) return;

  const issues = [
    ...collectLexicalIssues(text),
    ...collectFormatterIssue(text, dialect),
    ...collectSemanticDiagnostics(autocompleteContext, text),
  ];

  const markers: editor.IMarkerData[] = issues.map((issue) => ({
    ...offsetToMarkerRange(text, issue.startOffset, issue.endOffset),
    message: issue.message,
    severity:
      issue.severity === "warning"
        ? monacoInstance.MarkerSeverity.Warning
        : monacoInstance.MarkerSeverity.Error,
  }));

  monacoInstance.editor.setModelMarkers(model, "db-workbench", markers);
}

export function registerSqlEditorAutocompleteProvider({
  monacoInstance,
  autocompleteContext,
  onCompletionAccepted,
}: {
  monacoInstance: typeof import("monaco-editor");
  autocompleteContext: SqlAutocompleteContext;
  onCompletionAccepted?: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
}): IDisposable {
  return monacoInstance.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const cursorOffset = model.getOffsetAt(position);
      const sqlText = model.getValue();
      const aliasHint = resolveTableAlias(model.getValue(), cursorOffset);
      const items = buildCompletionItems(
        autocompleteContext,
        aliasHint,
        sqlText,
        cursorOffset,
      );
      const suggestions: languages.CompletionItem[] = items.map((item) => ({
        label: item.label,
        insertText: item.insertText,
        kind: mapCompletionKind(monacoInstance, item.kind),
        detail: item.detail,
        sortText: item.sortText,
        range,
        insertTextRules: item.insertAsSnippet
          ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        command:
          onCompletionAccepted && item.acceptedSuggestion
            ? {
                id: COMPLETION_ACCEPT_COMMAND_ID,
                title: "Record SQL completion acceptance",
                arguments: [item.acceptedSuggestion],
              }
            : undefined,
      }));

      return { suggestions };
    },
  });
}

export function registerSqlCompletionAcceptanceCommand({
  monacoInstance,
  onCompletionAccepted,
}: {
  monacoInstance: typeof import("monaco-editor");
  onCompletionAccepted?: (suggestion: SqlMemoryAcceptedSuggestionInput) => void;
}): IDisposable | null {
  if (!onCompletionAccepted) return null;

  return monacoInstance.editor.registerCommand(
    COMPLETION_ACCEPT_COMMAND_ID,
    (_accessor, suggestion?: SqlMemoryAcceptedSuggestionInput) => {
      if (!suggestion) return;
      onCompletionAccepted(suggestion);
    },
  );
}

export function registerSqlEditorHoverProvider({
  monacoInstance,
  autocompleteContext,
}: {
  monacoInstance: typeof import("monaco-editor");
  autocompleteContext: SqlAutocompleteContext;
}): IDisposable {
  return monacoInstance.languages.registerHoverProvider("sql", {
    provideHover: (model, position) => {
      const cursorOffset = model.getOffsetAt(position);
      const sqlText = model.getValue();
      const symbol = resolveSemanticHoverSymbol(
        autocompleteContext,
        sqlText,
        cursorOffset,
      );
      if (!symbol) return null;

      return {
        range: offsetToMarkerRange(sqlText, symbol.startOffset, symbol.endOffset),
        contents: [
          { value: `**${symbol.label}**` },
          { value: symbol.detail },
          ...symbol.documentation.map((line) => ({ value: line })),
        ],
      };
    },
  });
}
