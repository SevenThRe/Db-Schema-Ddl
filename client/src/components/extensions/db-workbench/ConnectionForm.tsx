import { useId, useState } from "react";
import {
  Loader2,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHostApiFor } from "@/extensions/host-context";
import {
  DEFAULT_DB_PORTS,
  autoNameFrom,
  parseConnectionString,
} from "@/lib/db-connection-string";
import type { DbConnectionConfig, DbDriver } from "@shared/schema";
import {
  ConnectionFormSupportScope,
  ConnectionFormTestResult,
  ConnectionGovernanceFields,
  ConnectionSecurityFields,
  ConnectionStringImportPanel,
} from "./connection-form-sections";
import {
  isAutoConnectionName,
} from "./workbench-connection-config-model";

export function ConnectionForm({
  initial,
  onSave,
  onCancel,
  extensionId,
}: {
  initial: DbConnectionConfig;
  onSave: (c: DbConnectionConfig) => void;
  onCancel: () => void;
  extensionId: string;
}) {
  const [form, setForm] = useState<DbConnectionConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState(false);
  const host = useHostApiFor(extensionId);
  const formId = useId();
  const showStoredPasswordControls = form.hasStoredPassword && !form.password;

  const handleParsePaste = () => {
    const parsed = parseConnectionString(pasteText);
    if (!parsed) {
      setParseError(true);
      return;
    }
    setParseError(false);
    setForm((prev) => {
      const next = { ...prev, ...parsed };
      if (isAutoConnectionName(prev)) {
        next.name = autoNameFrom(next.host, next.port, next.database);
      }
      if (parsed.password) {
        next.clearStoredPassword = false;
      }
      return next;
    });
    setShowPaste(false);
    setPasteText("");
  };

  const set = <K extends keyof DbConnectionConfig>(key: K, value: DbConnectionConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setWithAutoName = (patch: Partial<DbConnectionConfig>) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (isAutoConnectionName(prev)) {
        next.name = autoNameFrom(next.host, next.port, next.database);
      }
      return next;
    });

  const handleDriverChange = (driver: DbDriver) => {
    setForm((prev) => ({ ...prev, driver, port: DEFAULT_DB_PORTS[driver] }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await host.connections.test(form);
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <ConnectionFormSupportScope />

      <ConnectionStringImportPanel
        formId={formId}
        showPaste={showPaste}
        pasteText={pasteText}
        parseError={parseError}
        onTogglePaste={() => {
          setShowPaste((v) => !v);
          setParseError(false);
        }}
        onPasteTextChange={(value) => {
          setPasteText(value);
          setParseError(false);
        }}
        onParsePaste={handleParsePaste}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-name`} className="text-xs text-muted-foreground">名称</label>
          <Input
            id={`${formId}-name`}
            name="connection-name"
            autoComplete="organization"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="生产环境 MySQL"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-driver`} className="text-xs text-muted-foreground">驱动</label>
          <select
            id={`${formId}-driver`}
            name="driver"
            value={form.driver}
            onChange={(e) => handleDriverChange(e.target.value as DbDriver)}
            className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-port`} className="text-xs text-muted-foreground">端口</label>
          <Input
            id={`${formId}-port`}
            name="port"
            type="number"
            value={form.port}
            onChange={(e) => setWithAutoName({ port: Number(e.target.value) })}
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-host`} className="text-xs text-muted-foreground">主机</label>
          <Input
            id={`${formId}-host`}
            name="host"
            autoComplete="url"
            value={form.host}
            onChange={(e) => setWithAutoName({ host: e.target.value })}
            placeholder="localhost"
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-database`} className="text-xs text-muted-foreground">数据库名</label>
          <Input
            id={`${formId}-database`}
            name="database"
            autoComplete="off"
            value={form.database}
            onChange={(e) => setWithAutoName({ database: e.target.value })}
            placeholder="mydb"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-username`} className="text-xs text-muted-foreground">用户名</label>
          <Input
            id={`${formId}-username`}
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-password`} className="text-xs text-muted-foreground">密码</label>
          <Input
            id={`${formId}-password`}
            name="password"
            autoComplete="current-password"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                password: e.target.value,
                clearStoredPassword: e.target.value ? false : prev.clearStoredPassword,
              }))}
            placeholder={form.hasStoredPassword ? "已安全保存，留空则保持不变" : ""}
            className="h-7 text-xs"
          />
        </div>
        {showStoredPasswordControls ? (
          <div className="col-span-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <p>当前密码已安全保存在系统凭据库中。留空并保存会继续使用该密码。</p>
            <label className="mt-2 flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(form.clearStoredPassword)}
                onChange={(e) => set("clearStoredPassword", e.target.checked)}
              />
              <span>保存时移除已保存的密码</span>
            </label>
          </div>
        ) : null}

        <ConnectionSecurityFields formId={formId} form={form} set={set} />

        <ConnectionGovernanceFields formId={formId} form={form} set={set} />
      </div>

      <ConnectionFormTestResult testResult={testResult} />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleTest()} disabled={testing}>
          {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <TestTube2 className="mr-1 h-3 w-3" />}
          测试
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>取消</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave(form)} disabled={!form.name || !form.host || !form.database}>
          保存
        </Button>
      </div>
    </div>
  );
}
