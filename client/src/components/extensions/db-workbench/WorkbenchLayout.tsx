// DB Workbench main layout shell.
//
// Current runtime truth:
// - this is the canonical daily-driver DB surface inside the extension shell
// - session state restores per connection through loadSessionForConnection()/saveSessionForConnection()
// - dangerous SQL always passes through previewDangerousSql before confirmed execution
// - preview-only workflows such as Data Sync keep explicit preview wording until later promotion proof exists

import type {
  DbConnectionConfig,
} from "@shared/schema";
import type { HostApi } from "@/extensions/host-api";
import { WorkbenchOperatorChrome } from "./WorkbenchOperatorChrome";
import { WorkbenchWorkspaceBody } from "./WorkbenchWorkspaceBody";
import { WorkbenchDialogStack } from "./WorkbenchDialogStack";
import { useWorkbenchLayoutShellModel } from "./use-workbench-layout-shell-model";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

export interface WorkbenchLayoutProps {
  /** アクティブな接続設定 */
  connection: DbConnectionConfig;
  /** ホスト API（クエリ実行・キャンセル等で使用） */
  hostApi: HostApi;
  /** 打开连接管理面板 */
  onManageConnections: () => void;
  /** 工作台内で接続を切り替えるコールバック */
  onSwitchConnection: (connectionId: string) => void;
  /** 新しい拡張シェルに左サイドバーを委譲するか */
  sidebarMode?: "host" | "embedded";
}

// ──────────────────────────────────────────────
// メインレイアウトシェル
// ──────────────────────────────────────────────

/**
 * DB 工作台 メインレイアウトシェル
 *
 * 環境帯 + 左サイドバー（ConnectionSidebar）+ タブバー（QueryTabs）+
 * エディター（SqlEditorPane）+ 結果/EXPLAIN エリア（ResultGridPane / ExplainPlanPane）+
 * 危険 SQL 確認ダイアログ（DangerousSqlDialog）
 */
export function WorkbenchLayout({
  connection,
  hostApi,
  onManageConnections,
  onSwitchConnection,
  sidebarMode = "embedded",
}: WorkbenchLayoutProps) {
  const {
    operatorChromeProps,
    workspaceBodyProps,
    dialogStackProps,
  } = useWorkbenchLayoutShellModel({
    connection,
    hostApi,
    onManageConnections,
    onSwitchConnection,
    sidebarMode,
  });

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <WorkbenchOperatorChrome
          {...operatorChromeProps}
        />

        <WorkbenchWorkspaceBody {...workspaceBodyProps} />
      </div>

      <WorkbenchDialogStack {...dialogStackProps} />

    </>
  );
}
