import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDdlSettings } from "../../shared/config";
import type { SqlCopilotSettingsDraft } from "../../client/src/components/extensions/db-workbench/SqlCopilotDialog";
import {
  createWorkbenchSchemaStateActions,
  runApplyDdlSettingsToSqlCopilotDraft,
  runNotifyDdlSettingsFailure,
  runNotifySchemaLoadFailure,
  runNotifySchemaOptionsFailure,
  runResolveSelectedTableForSchema,
} from "../../client/src/components/extensions/db-workbench/workbench-schema-state-runner";

test("schema state runner emits schema load failure notices only when present", () => {
  const notices: unknown[] = [];

  assert.equal(
    runNotifySchemaLoadFailure({
      schemaErrorMessage: null,
      showNotification: (notice) => notices.push(notice),
    }),
    false,
  );
  assert.equal(notices.length, 0);

  assert.equal(
    runNotifySchemaLoadFailure({
      schemaErrorMessage: "login failed",
      showNotification: (notice) => notices.push(notice),
    }),
    true,
  );
  assert.deepEqual(notices, [
    {
      title: "数据库当前不可连接",
      description: "login failed",
      variant: "destructive",
    },
  ]);
});

test("schema state runner reports schema options failures only for postgres", () => {
  const notices: unknown[] = [];

  assert.equal(
    runNotifySchemaOptionsFailure({
      driver: "mysql",
      schemaOptionsError: new Error("not available"),
      showNotification: (notice) => notices.push(notice),
    }),
    false,
  );
  assert.equal(notices.length, 0);

  assert.equal(
    runNotifySchemaOptionsFailure({
      driver: "postgres",
      schemaOptionsError: new Error("not available"),
      showNotification: (notice) => notices.push(notice),
    }),
    true,
  );
  assert.equal((notices[0] as { title: string }).title, "Schema list unavailable");
  assert.match(
    (notices[0] as { description: string }).description,
    /not available/,
  );
});

test("schema state runner syncs ddl settings into sql copilot draft", () => {
  let draft: SqlCopilotSettingsDraft | null = null;
  const settings = {
    ...createDefaultDdlSettings(),
    sqlCopilotEnabled: true,
    sqlCopilotProvider: "ollama" as const,
    sqlCopilotOllamaBaseUrl: " http://127.0.0.1:11434 ",
    sqlCopilotOllamaModel: " qwen ",
  };

  assert.equal(
    runApplyDdlSettingsToSqlCopilotDraft({
      ddlSettings: undefined,
      setSqlCopilotSettingsDraft: (nextDraft) => {
        draft = nextDraft;
      },
    }),
    false,
  );
  assert.equal(draft, null);

  assert.equal(
    runApplyDdlSettingsToSqlCopilotDraft({
      ddlSettings: settings,
      setSqlCopilotSettingsDraft: (nextDraft) => {
        draft = nextDraft;
      },
    }),
    true,
  );
  assert.equal(draft?.sqlCopilotEnabled, true);
  assert.equal(draft?.sqlCopilotProvider, "ollama");
  assert.equal(draft?.sqlCopilotOllamaBaseUrl, " http://127.0.0.1:11434 ");
  assert.equal(draft?.sqlCopilotOllamaModel, "qwen");
});

test("schema state runner reports ddl settings failures", () => {
  const notices: unknown[] = [];

  assert.equal(
    runNotifyDdlSettingsFailure({
      ddlSettingsError: null,
      showNotification: (notice) => notices.push(notice),
    }),
    false,
  );
  assert.equal(notices.length, 0);

  assert.equal(
    runNotifyDdlSettingsFailure({
      ddlSettingsError: new Error("settings file locked"),
      showNotification: (notice) => notices.push(notice),
    }),
    true,
  );
  assert.equal(
    (notices[0] as { title: string }).title,
    "SQL copilot settings unavailable",
  );
  assert.match(
    (notices[0] as { description: string }).description,
    /settings file locked/,
  );
});

test("schema state runner repairs selected table when schema tables change", () => {
  let selectedTableName: string | null = "missing";

  runResolveSelectedTableForSchema({
    tables: [{ name: "orders" }, { name: "users" }],
    setSelectedTableName: (updater) => {
      selectedTableName = updater(selectedTableName);
    },
  });
  assert.equal(selectedTableName, "orders");

  runResolveSelectedTableForSchema({
    tables: [{ name: "orders" }, { name: "users" }],
    setSelectedTableName: (updater) => {
      selectedTableName = updater(selectedTableName);
    },
  });
  assert.equal(selectedTableName, "orders");
});

test("schema state runner creates reusable state action objects", () => {
  const notices: unknown[] = [];
  let draft: SqlCopilotSettingsDraft | null = null;
  let selectedTableName: string | null = "missing";
  const actions = createWorkbenchSchemaStateActions({
    showNotification: (notice) => notices.push(notice),
    setSqlCopilotSettingsDraft: (nextDraft) => {
      draft = nextDraft;
    },
    setSelectedTableName: (updater) => {
      selectedTableName = updater(selectedTableName);
    },
  });

  actions.notifySchemaLoadFailure("login failed");
  actions.applyDdlSettingsToSqlCopilotDraft({
    ...createDefaultDdlSettings(),
    sqlCopilotEnabled: true,
  });
  actions.resolveSelectedTableForSchema([{ name: "orders" }]);

  assert.equal((notices[0] as { title: string }).title, "数据库当前不可连接");
  assert.equal(draft?.sqlCopilotEnabled, true);
  assert.equal(selectedTableName, "orders");
});
