import {
  CheckCircle2,
  ChevronRight,
  Clipboard,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DbConnectionConfig, DbSslMode } from "@shared/schema";
import {
  asColorInputValue,
  DB_SSL_MODES,
  effectiveSslMode,
  sslModeLabel,
  sslModeRequiresRootCert,
} from "./workbench-connection-config-model";

type SetConnectionField = <K extends keyof DbConnectionConfig>(
  key: K,
  value: DbConnectionConfig[K],
) => void;

export function ConnectionFormSupportScope() {
  return (
    <div className="rounded-md border border-border bg-panel-muted/30 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        P0 support scope
      </p>
      <p className="mt-1 text-[11px] text-foreground">
        Current build supports direct MySQL / PostgreSQL connections with saved-password handling and TLS/SSL transport (prefer / require / verify-ca / verify-full).
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        TLS is wired end-to-end and code-level verified, but not yet validated against a live TLS-required server. SSH tunnelling and enterprise auth are not product-supported in this build. Environment, readonly, default schema, favorite, group, color tag, and notes are operator controls, not cosmetic metadata.
      </p>
    </div>
  );
}

export function ConnectionStringImportPanel({
  formId,
  showPaste,
  pasteText,
  parseError,
  onTogglePaste,
  onPasteTextChange,
  onParsePaste,
}: {
  formId: string;
  showPaste: boolean;
  pasteText: string;
  parseError: boolean;
  onTogglePaste: () => void;
  onPasteTextChange: (value: string) => void;
  onParsePaste: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/10">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={onTogglePaste}
      >
        <Clipboard className="h-3 w-3" />
        粘贴连接字符串导入
        <ChevronRight className={cn("ml-auto h-3 w-3 transition-transform", showPaste && "rotate-90")} />
      </button>
      {showPaste && (
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          <textarea
            id={`${formId}-paste`}
            name="connection-paste"
            value={pasteText}
            onChange={(event) => onPasteTextChange(event.target.value)}
            placeholder={"mysql://user:pass@host:3306/db\npostgresql://user:pass@host:5432/db\njdbc:mysql://host:3306/db?user=u&password=p\nhost=localhost port=5432 dbname=mydb user=u password=p\nDB_HOST=localhost DB_PORT=3306 DB_NAME=mydb DB_USER=root DB_PASSWORD=secret\n<DataSourceSettings>...<jdbc-url>jdbc:mysql://localhost:3306/db</jdbc-url>...</DataSourceSettings>"}
            rows={4}
            className={cn(
              "w-full resize-none rounded-md border bg-background px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring",
              parseError ? "border-destructive" : "border-border",
            )}
          />
          {parseError && (
            <p className="text-[10px] text-destructive">无法识别格式，请检查后重试</p>
          )}
          <Button
            size="sm"
            className="h-6 w-full text-xs"
            onClick={onParsePaste}
            disabled={!pasteText.trim()}
          >
            解析并填入
          </Button>
        </div>
      )}
    </div>
  );
}

export function ConnectionGovernanceFields({
  formId,
  form,
  set,
}: {
  formId: string;
  form: DbConnectionConfig;
  set: SetConnectionField;
}) {
  return (
    <div className="col-span-2 mt-1 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">连接治理</p>
          <p className="text-[10px] text-muted-foreground">
            管理环境、默认 schema、分组、收藏和操作备注。
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(form.favorite)}
            onChange={(event) => set("favorite", event.target.checked)}
          />
          <span>收藏</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`${formId}-environment`} className="text-xs text-muted-foreground">
            环境
          </label>
          <select
            id={`${formId}-environment`}
            value={form.environment ?? ""}
            onChange={(event) =>
              set(
                "environment",
                (event.target.value || undefined) as DbConnectionConfig["environment"],
              )}
            className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">未分类</option>
            <option value="dev">dev</option>
            <option value="test">test</option>
            <option value="prod">prod</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-default-schema`} className="text-xs text-muted-foreground">
            默认 Schema
          </label>
          <Input
            id={`${formId}-default-schema`}
            name="default-schema"
            value={form.defaultSchema ?? ""}
            onChange={(event) => set("defaultSchema", event.target.value)}
            placeholder={form.driver === "postgres" ? "public" : "留空使用数据库默认"}
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-group`} className="text-xs text-muted-foreground">
            分组
          </label>
          <Input
            id={`${formId}-group`}
            name="group-name"
            value={form.groupName ?? ""}
            onChange={(event) => set("groupName", event.target.value)}
            placeholder="例如：Production / Analytics / Local"
            className="h-7 text-xs"
          />
        </div>

        <div className="col-span-2 flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-2">
          <label htmlFor={`${formId}-color`} className="shrink-0 text-xs text-muted-foreground">
            颜色标签
          </label>
          <input
            id={`${formId}-color`}
            type="color"
            value={asColorInputValue(form.colorTag)}
            onChange={(event) => set("colorTag", event.target.value)}
            className="h-7 w-10 shrink-0 rounded border border-border bg-transparent p-0.5"
          />
          <Input
            value={form.colorTag ?? ""}
            onChange={(event) => set("colorTag", event.target.value)}
            placeholder="#3b82f6"
            className="h-7 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => set("colorTag", undefined)}
          >
            清除
          </Button>
        </div>

        <div className="col-span-2 rounded-md border border-border/60 bg-background px-2 py-2">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(form.readonly)}
              onChange={(event) => set("readonly", event.target.checked)}
            />
            <span>只读连接</span>
          </label>
          <p className="mt-1 text-[10px] text-muted-foreground">
            启用后，工作台会在运行时阻止 DML / DDL / Data Sync apply。
          </p>
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-notes`} className="text-xs text-muted-foreground">
            备注
          </label>
          <textarea
            id={`${formId}-notes`}
            name="notes"
            value={form.notes ?? ""}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            placeholder="例如：BI 只读账号 / 走跳板机 / 每晚同步后再查"
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

export function ConnectionSecurityFields({
  formId,
  form,
  set,
}: {
  formId: string;
  form: DbConnectionConfig;
  set: SetConnectionField;
}) {
  const mode = effectiveSslMode(form);
  const needsRootCert = sslModeRequiresRootCert(mode);
  const missingRootCert = needsRootCert && !form.sslRootCert?.trim();

  return (
    <div className="col-span-2 mt-1 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="mb-2">
        <p className="text-xs font-medium text-foreground">传输加密 (TLS/SSL)</p>
        <p className="text-[10px] text-muted-foreground">
          控制连接是否走 TLS,以及是否校验服务器证书。连接到云数据库 / 跳板机后端通常需要 require 或以上。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-ssl-mode`} className="text-xs text-muted-foreground">
            加密模式
          </label>
          <select
            id={`${formId}-ssl-mode`}
            name="ssl-mode"
            value={mode}
            onChange={(event) => set("sslMode", event.target.value as DbSslMode)}
            className="h-7 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            {DB_SSL_MODES.map((option) => (
              <option key={option} value={option}>
                {sslModeLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 space-y-1">
          <label htmlFor={`${formId}-ssl-root-cert`} className="text-xs text-muted-foreground">
            根 CA 证书路径{needsRootCert ? "（必填）" : "（可选）"}
          </label>
          <Input
            id={`${formId}-ssl-root-cert`}
            name="ssl-root-cert"
            value={form.sslRootCert ?? ""}
            onChange={(event) => set("sslRootCert", event.target.value)}
            placeholder="/path/to/ca.pem"
            className={cn("h-7 text-xs", missingRootCert && "border-destructive")}
          />
          {missingRootCert ? (
            <p className="text-[10px] text-destructive">
              verify-ca / verify-full 需要根 CA 证书才能校验服务器身份。
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-ssl-client-cert`} className="text-xs text-muted-foreground">
            客户端证书（mTLS，可选）
          </label>
          <Input
            id={`${formId}-ssl-client-cert`}
            name="ssl-client-cert"
            value={form.sslClientCert ?? ""}
            onChange={(event) => set("sslClientCert", event.target.value)}
            placeholder="/path/to/client-cert.pem"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`${formId}-ssl-client-key`} className="text-xs text-muted-foreground">
            客户端私钥（mTLS，可选）
          </label>
          <Input
            id={`${formId}-ssl-client-key`}
            name="ssl-client-key"
            value={form.sslClientKey ?? ""}
            onChange={(event) => set("sslClientKey", event.target.value)}
            placeholder="/path/to/client-key.pem"
            className="h-7 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

export function ConnectionFormTestResult({
  testResult,
}: {
  testResult: { ok: boolean; msg: string } | null;
}) {
  if (!testResult) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-3 py-2 text-xs",
        testResult.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {testResult.ok ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      )}
      <span className="break-all">{testResult.msg}</span>
    </div>
  );
}
