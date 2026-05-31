import { useId, useMemo, useState } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DbDriver, DbTableSchema } from "@shared/schema";
import {
  buildCreateTableDdl,
  diffTableDraft,
  emptyTableDraft,
  emptyTableDraftColumn,
  tableDesignChangesToScript,
  tableDraftFromSchema,
  type TableDraft,
  type TableDraftColumn,
} from "./table-designer-model";

const COMMON_TYPES: Record<DbDriver, string[]> = {
  mysql: [
    "int",
    "bigint",
    "tinyint(1)",
    "varchar(255)",
    "text",
    "datetime",
    "timestamp",
    "date",
    "decimal(10,2)",
    "json",
  ],
  postgres: [
    "integer",
    "bigint",
    "boolean",
    "varchar(255)",
    "text",
    "timestamptz",
    "date",
    "numeric(10,2)",
    "jsonb",
    "uuid",
  ],
};

export function TableDesignerPanel({
  driver,
  schemaName,
  sourceSchema,
  onApplyDdl,
  onClose,
}: {
  driver: DbDriver;
  schemaName?: string;
  sourceSchema?: DbTableSchema | null;
  onApplyDdl?: (sql: string) => void;
  onClose?: () => void;
}) {
  const isAlter = Boolean(sourceSchema);
  const [draft, setDraft] = useState<TableDraft>(() =>
    sourceSchema ? tableDraftFromSchema(sourceSchema) : emptyTableDraft(),
  );
  const [copied, setCopied] = useState(false);
  const formId = useId();
  const typeListId = `${formId}-types`;

  const { ddl, changeCount } = useMemo(() => {
    if (sourceSchema) {
      const changes = diffTableDraft(sourceSchema, draft, driver, schemaName);
      return { ddl: tableDesignChangesToScript(changes), changeCount: changes.length };
    }
    return { ddl: buildCreateTableDdl(draft, driver, schemaName), changeCount: 0 };
  }, [sourceSchema, draft, driver, schemaName]);

  const setColumn = (id: string, patch: Partial<TableDraftColumn>) =>
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    }));

  const addColumn = () =>
    setDraft((prev) => ({
      ...prev,
      columns: [...prev.columns, emptyTableDraftColumn()],
    }));

  const removeColumn = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.filter((column) => column.id !== id),
    }));

  const canApply =
    draft.name.trim().length > 0 &&
    draft.columns.length > 0 &&
    ddl.trim().length > 0 &&
    (!isAlter || changeCount > 0);

  const handleCopy = () => {
    if (!ddl.trim()) return;
    void navigator.clipboard?.writeText(ddl);
    setCopied(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <p className="text-sm font-semibold">
            {isAlter ? `Edit table ${sourceSchema?.name}` : "New table"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isAlter
              ? "结构编辑会生成最小 ALTER 集合，应用前可预览。"
              : "可视化设计新表，生成 CREATE TABLE。"}
            {" "}
            <span className="font-mono">{driver}</span>
          </p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            关闭
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-2">
        <div className="space-y-1">
          <label htmlFor={`${formId}-name`} className="text-xs text-muted-foreground">
            表名
          </label>
          <Input
            id={`${formId}-name`}
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="orders"
            className="h-7 text-xs"
            disabled={isAlter}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${formId}-comment`} className="text-xs text-muted-foreground">
            表注释
          </label>
          <Input
            id={`${formId}-comment`}
            value={draft.comment ?? ""}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, comment: event.target.value }))}
            placeholder="可选"
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <datalist id={typeListId}>
          {COMMON_TYPES[driver].map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>

        <div className="grid grid-cols-[1.4fr_1.4fr_auto_auto_1.2fr_1.4fr_auto] items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span>列名</span>
          <span>类型</span>
          <span title="允许 NULL">NULL</span>
          <span title="主键">PK</span>
          <span>默认值</span>
          <span>注释</span>
          <span />
        </div>

        <div className="space-y-1">
          {draft.columns.map((column) => (
            <div
              key={column.id}
              className="grid grid-cols-[1.4fr_1.4fr_auto_auto_1.2fr_1.4fr_auto] items-center gap-2"
            >
              <Input
                value={column.name}
                onChange={(event) => setColumn(column.id, { name: event.target.value })}
                placeholder="column"
                className="h-7 text-xs"
              />
              <Input
                list={typeListId}
                value={column.dataType}
                onChange={(event) => setColumn(column.id, { dataType: event.target.value })}
                placeholder="varchar(255)"
                className="h-7 font-mono text-xs"
              />
              <input
                type="checkbox"
                aria-label="允许 NULL"
                checked={column.nullable}
                onChange={(event) => setColumn(column.id, { nullable: event.target.checked })}
              />
              <input
                type="checkbox"
                aria-label="主键"
                checked={column.primaryKey}
                onChange={(event) =>
                  setColumn(column.id, {
                    primaryKey: event.target.checked,
                    nullable: event.target.checked ? false : column.nullable,
                  })}
              />
              <Input
                value={column.defaultValue ?? ""}
                onChange={(event) =>
                  setColumn(column.id, { defaultValue: event.target.value })}
                placeholder="NULL"
                className="h-7 font-mono text-xs"
              />
              <Input
                value={column.comment ?? ""}
                onChange={(event) => setColumn(column.id, { comment: event.target.value })}
                placeholder="可选"
                className="h-7 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeColumn(column.id)}
                aria-label="删除列"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={addColumn}
        >
          <Plus className="mr-1 h-3 w-3" />
          添加列
        </Button>
      </div>

      <div className="min-h-0 border-t border-border">
        <div className="flex items-center justify-between px-4 py-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {isAlter ? `ALTER 预览（${changeCount} 项变更）` : "CREATE 预览"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={handleCopy}
            disabled={!ddl.trim()}
          >
            {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
            复制 DDL
          </Button>
        </div>
        <pre
          className={cn(
            "max-h-48 overflow-auto border-t border-border bg-muted/20 px-4 py-2 font-mono text-[11px] leading-5",
            !ddl.trim() && "text-muted-foreground",
          )}
        >
          {ddl.trim() || (isAlter ? "无结构变更。" : "添加列以生成 CREATE TABLE。")}
        </pre>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <div className="flex-1" />
        {onClose ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            取消
          </Button>
        ) : null}
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!canApply || !onApplyDdl}
          onClick={() => onApplyDdl?.(ddl)}
        >
          {isAlter ? "应用变更" : "创建表"}
        </Button>
      </div>
    </div>
  );
}
