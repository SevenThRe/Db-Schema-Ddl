// builtin 拡張の全パネルコンポーネントをレジストリに登録する
//
// アプリ起動時（App.tsx）に一度だけ呼ぶ。

import { registerPanel, type ExtensionWorkspaceProps } from "../panel-registry";
import { DbConnectorWorkspace } from "@/components/extensions/DbConnectorWorkspace";
import { DdlToExcelWorkspace } from "@/components/extensions/DdlToExcelWorkspace";
import { EnumGenWorkspace } from "@/components/extensions/EnumGenWorkspace";
import { SchemaDiffPanel } from "@/components/SchemaDiffPanel";
import { AlertCircle } from "lucide-react";

let registered = false;

/** EnumGenWorkspace は fileId/fileName 必須のため、未選択時にフォールバックを表示するラッパー */
function EnumGenWorkspaceEntry({ fileId, fileName }: ExtensionWorkspaceProps) {
  if (fileId == null || !fileName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">ファイルを選択してください</p>
      </div>
    );
  }
  return <EnumGenWorkspace fileId={fileId} fileName={fileName} />;
}

/** SchemaDiffPanel は fileId/sheetName を受け取る — 独立ワークスペースでは null を渡す */
function SchemaDiffPanelEntry({ fileId }: ExtensionWorkspaceProps) {
  return <SchemaDiffPanel fileId={fileId ?? null} sheetName={null} />;
}

export function registerBuiltinPanels(): void {
  if (registered) return;
  registered = true;

  registerPanel("DbConnectorWorkspace", DbConnectorWorkspace as React.ComponentType<ExtensionWorkspaceProps>);
  registerPanel("DdlToExcelWorkspace", DdlToExcelWorkspace as React.ComponentType<ExtensionWorkspaceProps>);
  registerPanel("EnumGenWorkspace", EnumGenWorkspaceEntry);
  registerPanel("SchemaDiffPanel", SchemaDiffPanelEntry);
}
