import { useEffect, useState } from "react";
import type { DbConnectionSummary, DbConnectionUpsertRequest } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PlugZap, Save, Trash2 } from "lucide-react";

interface ConnectionManagerProps {
  connections: DbConnectionSummary[];
  selectedConnectionId: number | null;
  onSelectConnection: (connectionId: number) => void;
  onSave: (input: DbConnectionUpsertRequest, connectionId?: number) => Promise<void>;
  onDelete: (connectionId: number) => Promise<void>;
  onTest: (connectionId: number) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
  isTesting: boolean;
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
  isSaving,
  isDeleting,
  isTesting,
}: ConnectionManagerProps) {
  const [form, setForm] = useState<DbConnectionUpsertRequest>(EMPTY_FORM);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;

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

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">连接管理</CardTitle>
        <CardDescription>保存 MySQL server 连接，测试连通性，并复用已记住的密码。</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ScrollArea className="max-h-52 rounded-md border border-border/60">
          <div className="space-y-2 p-2">
            {connections.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                还没有保存的 MySQL 连接。
              </div>
            ) : (
              connections.map((connection) => (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => onSelectConnection(connection.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    connection.id === selectedConnectionId
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
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
                        <Badge variant="outline" className="text-[10px]">
                          已记住密码
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-[10px]">
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

        <div className="grid gap-3 md:grid-cols-2">
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
            <Label htmlFor="db-connection-host">Host</Label>
            <Input
              id="db-connection-host"
              value={form.host}
              onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
              placeholder="127.0.0.1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-connection-port">Port</Label>
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
                <SelectItem value="disable">disable</SelectItem>
                <SelectItem value="preferred">preferred</SelectItem>
                <SelectItem value="required">required</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">记住密码</div>
              <div className="text-xs text-muted-foreground">默认保存到本机受保护存储，下次可直接重连。</div>
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
          <Button onClick={() => void handleSubmit()} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {selectedConnection ? "更新连接" : "保存连接"}
          </Button>
          {selectedConnection ? (
            <>
              <Button
                variant="outline"
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
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            最近测试结果：{selectedConnection.lastTestMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
