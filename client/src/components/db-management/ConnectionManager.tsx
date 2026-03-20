import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
  DbConnectionImportDraft,
  DbConnectionImportResponse,
  DbConnectionSummary,
  DbConnectionUpsertRequest,
} from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PlugZap, Save, Trash2, Upload } from "lucide-react";

interface ConnectionManagerProps {
  connections: DbConnectionSummary[];
  selectedConnectionId: number | null;
  onSelectConnection: (connectionId: number) => void;
  onSave: (input: DbConnectionUpsertRequest, connectionId?: number) => Promise<void>;
  onDelete: (connectionId: number) => Promise<void>;
  onTest: (connectionId: number) => Promise<void>;
  onParseImports: (input: { content: string; fileName?: string }) => Promise<DbConnectionImportResponse>;
  onSaveImportedDrafts: (drafts: DbConnectionImportDraft[]) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
  isTesting: boolean;
  isImporting: boolean;
}

const EMPTY_FORM: DbConnectionUpsertRequest = {
  name: "",
  host: "",
  port: 3306,
  username: "",
  password: "",
  rememberPassword: true,
  clearSavedPassword: false,
  sslMode: "preferred",
};

export function ConnectionManager({
  connections,
  selectedConnectionId,
  onSelectConnection,
  onSave,
  onDelete,
  onTest,
  onParseImports,
  onSaveImportedDrafts,
  isSaving,
  isDeleting,
  isTesting,
  isImporting,
}: ConnectionManagerProps) {
  const [form, setForm] = useState<DbConnectionUpsertRequest>(EMPTY_FORM);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState<string | undefined>();
  const [importResult, setImportResult] = useState<DbConnectionImportResponse | null>(null);
  const [isBulkImportSaving, setIsBulkImportSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const savableImportDrafts = useMemo(
    () => (importResult?.drafts ?? []).filter((draft) => draft.missingFields.length === 0),
    [importResult],
  );

  useEffect(() => {
    if (!selectedConnection) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      name: selectedConnection.name,
      host: selectedConnection.host,
      port: selectedConnection.port,
      username: selectedConnection.username,
      password: "",
      rememberPassword: selectedConnection.rememberPassword,
      clearSavedPassword: false,
      sslMode: selectedConnection.sslMode,
    });
  }, [selectedConnection]);

  const handleSubmit = async () => {
    await onSave(form, selectedConnection?.id);
    if (!selectedConnection) {
      setForm(EMPTY_FORM);
    } else {
      setForm((current) => ({ ...current, password: "", clearSavedPassword: false }));
    }
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setImportFileName(file.name);
      setImportText(await file.text());
    } finally {
      event.target.value = "";
    }
  };

  const handleParseImports = async () => {
    try {
      const result = await onParseImports({
        content: importText,
        fileName: importFileName,
      });
      setImportResult(result);
    } catch {
      // Toast is handled by the workspace-level mutation wrapper.
    }
  };

  const loadDraftIntoForm = (draft: DbConnectionImportDraft) => {
    setForm({
      name: draft.name,
      host: draft.host,
      port: draft.port,
      username: draft.username,
      password: draft.password ?? "",
      rememberPassword: true,
      clearSavedPassword: false,
      sslMode: draft.sslMode,
    });
    onSelectConnection(0);
    setIsImportDialogOpen(false);
  };

  const handleSaveSavableImports = async () => {
    if (savableImportDrafts.length === 0) {
      return;
    }

    setIsBulkImportSaving(true);
    try {
      await onSaveImportedDrafts(savableImportDrafts);
      setIsImportDialogOpen(false);
      setImportResult(null);
      setImportText("");
      setImportFileName(undefined);
    } finally {
      setIsBulkImportSaving(false);
    }
  };

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="border-b border-border p-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base text-[hsl(var(--workspace-ink))]">连接</CardTitle>
            <CardDescription className="mt-1 text-xs">保存、导入、测试 MySQL 连接。</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="rounded-sm px-3" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            导入
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        <ScrollArea className="max-h-40 border border-border bg-muted/20">
          <div className="divide-y divide-border">
            {connections.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                还没有保存的 MySQL 连接。
              </div>
            ) : (
              connections.map((connection) => (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => onSelectConnection(connection.id)}
                  className={`w-full px-3 py-3 text-left transition ${
                    connection.id === selectedConnectionId
                      ? "bg-primary/8"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{connection.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {connection.username}@{connection.host}:{connection.port}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {connection.passwordStored ? (
                        <Badge variant="outline" className="rounded-sm text-[10px]">
                          已记住密码
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="rounded-sm text-[10px]">
                        {connection.lastTestStatus === "ok"
                          ? "测试通过"
                          : connection.lastTestStatus === "failed"
                            ? "测试失败"
                            : "未测试"}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="grid gap-2 border border-border bg-background p-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="db-connection-name">连接名称</Label>
            <Input
              id="db-connection-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="开发库 / 测试库"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-connection-host">主机</Label>
            <Input
              id="db-connection-host"
              value={form.host}
              onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
              placeholder="127.0.0.1 或 192.168.3.227:3306"
            />
            <div className="text-[10px] text-muted-foreground">
              支持直接填写 `host:port`，例如 `192.168.3.227:3306`。
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-connection-port">端口</Label>
            <Input
              id="db-connection-port"
              type="number"
              value={form.port}
              onChange={(event) =>
                setForm((current) => ({ ...current, port: Number(event.target.value || 3306) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-connection-username">用户名</Label>
            <Input
              id="db-connection-username"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="root"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="db-connection-password">
              {selectedConnection ? "新密码（留空则保留已保存密码）" : "密码"}
            </Label>
            <Input
              id="db-connection-password"
              type="password"
              value={form.password ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={selectedConnection?.passwordStored ? "留空则沿用当前保存密码" : "输入 MySQL 密码"}
            />
          </div>
          <div className="space-y-2">
            <Label>SSL 模式</Label>
            <Select
              value={form.sslMode}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  sslMode: value as DbConnectionUpsertRequest["sslMode"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disable">禁用</SelectItem>
                <SelectItem value="preferred">优先</SelectItem>
                <SelectItem value="required">必需</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">记住密码</div>
              <div className="text-[10px] text-muted-foreground">后续列库和快照读取会复用。</div>
            </div>
            <Switch
              checked={form.rememberPassword}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  rememberPassword: checked,
                  clearSavedPassword: !checked,
                }))
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className="rounded-sm px-4" onClick={() => void handleSubmit()} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {selectedConnection ? "更新连接" : "保存连接"}
          </Button>
          {selectedConnection ? (
            <>
              <Button
                variant="outline"
                className="rounded-sm px-4"
                onClick={() => void onTest(selectedConnection.id)}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="mr-2 h-4 w-4" />
                )}
                测试连接
              </Button>
              <Button
                variant="outline"
                className="rounded-sm px-4"
                onClick={() => void onDelete(selectedConnection.id)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                删除
              </Button>
              <Button
                variant="ghost"
                className="rounded-sm px-4"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  onSelectConnection(0);
                }}
              >
                新建连接
              </Button>
            </>
          ) : null}
        </div>

        {selectedConnection?.lastTestMessage ? (
          <div className="border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            最近测试结果：{selectedConnection.lastTestMessage}
          </div>
        ) : null}

        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>导入连接配置</DialogTitle>
              <DialogDescription>
                支持 JDBC URL、Spring `application.yml` / `.properties`，以及任何包含 `jdbc:mysql://...` 的文本导出内容。识别到多条数据源时会一起列出来。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".yml,.yaml,.properties,.txt,.conf,.cnf,.json,.xml"
                  onChange={(event) => {
                    void handleImportFileChange(event);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择配置文件
                </Button>
                {importFileName ? (
                  <Badge variant="outline">{importFileName}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">也可以直接把配置文本粘贴到下面。</span>
                )}
              </div>

              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="min-h-[220px] font-mono text-xs"
                placeholder={"spring:\n  datasource:\n    primary:\n      url: jdbc:mysql://127.0.0.1:3306/app\n      username: root\n      password: secret"}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleParseImports()}
                  disabled={isImporting || importText.trim().length === 0}
                >
                  {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  解析连接
                </Button>
                {savableImportDrafts.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleSaveSavableImports()}
                    disabled={isBulkImportSaving}
                  >
                    {isBulkImportSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    批量保存可用连接（{savableImportDrafts.length}）
                  </Button>
                ) : null}
              </div>

              {importResult?.findings.length ? (
                <div className="border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {importResult.findings.map((finding) => (
                    <div key={finding}>{finding}</div>
                  ))}
                </div>
              ) : null}

              {importResult?.drafts.length ? (
                <ScrollArea className="max-h-64 border border-border">
                  <div className="space-y-2 p-2">
                    {importResult.drafts.map((draft) => (
                      <div key={`${draft.sourceLabel}-${draft.name}`} className="border border-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{draft.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(draft.username || "用户名待补充")}@{draft.host}:{draft.port}
                              {draft.databaseName ? ` / ${draft.databaseName}` : ""}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{draft.sourceLabel}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{draft.sourceType}</Badge>
                            {draft.missingFields.map((field) => (
                              <Badge key={field} variant="outline">
                                缺少{field === "password" ? "密码" : "用户名"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => loadDraftIntoForm(draft)}>
                            填入表单
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
