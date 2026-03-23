// 拡張ワークスペースホスト — panelId からレジストリを参照してコンポーネントを描画
//
// Dashboard のメインエリアで surface.kind === "extension" のとき使用する。
// 無効化された拡張はレンダリングをブロックし、Capability スコープ済み HostApi を提供する。

import { AlertCircle, PowerOff } from "lucide-react";
import { getPanel, type ExtensionWorkspaceProps } from "./panel-registry";
import { useExtensionHost, useHostApiFor } from "./host-context";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import type { HostApi } from "./host-api";

// ── スコープ済み HostApi コンテキスト ──────────────────
const ScopedHostApiContext = createContext<HostApi | null>(null);

/** ExtensionWorkspaceHost の子から Capability スコープ済み HostApi を取得する hook */
export function useScopedHostApi(): HostApi | null {
  return useContext(ScopedHostApiContext);
}

// ──────────────────────────────────────────────

interface ExtensionWorkspaceHostProps {
  extensionId: string;
  panelId: string;
  fileId?: number | null;
  fileName?: string | null;
}

export function ExtensionWorkspaceHost({
  extensionId,
  panelId,
  fileId,
  fileName,
}: ExtensionWorkspaceHostProps) {
  const { t } = useTranslation();
  const { workspacePanels, extensions } = useExtensionHost();
  const scopedHostApi = useHostApiFor(extensionId);

  // 拡張の有効状態を確認する
  const ext = extensions.find((e) => e.manifest.id === extensionId);
  if (ext && !ext.enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <PowerOff className="h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          {t("extensions.workspace.disabled")}
        </p>
        <p className="text-xs text-muted-foreground opacity-60">
          {ext.manifest.name}
        </p>
      </div>
    );
  }

  // workspacePanels から component キーを解決
  const panelDef = workspacePanels.find((p) => p.id === panelId);
  const componentKey = panelDef?.component ?? panelId;
  const Panel = getPanel(componentKey);

  if (!Panel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          {t("extensions.workspace.panelNotFound", { panelId })}
        </p>
      </div>
    );
  }

  const props: ExtensionWorkspaceProps = {
    extensionId,
    fileId,
    fileName,
  };

  return (
    <ScopedHostApiContext.Provider value={scopedHostApi}>
      <div className="flex h-full flex-col overflow-hidden">
        <Panel {...props} />
      </div>
    </ScopedHostApiContext.Provider>
  );
}
