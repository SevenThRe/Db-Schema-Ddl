import test from "node:test";
import assert from "node:assert/strict";

import type { SqlWorkbenchMemoryState } from "../../client/src/components/extensions/db-workbench/sql-memory.ts";
import {
  createWorkbenchSqlMemoryController,
} from "../../client/src/components/extensions/db-workbench/workbench-sql-memory-controller.ts";

function createMemoryState(): SqlWorkbenchMemoryState {
  return {
    retention: {
      trackAcceptedSuggestions: true,
      trackQueryPatterns: true,
      captureValueProfiles: true,
    },
    acceptedSuggestions: [],
    queryPatterns: [],
    valueProfiles: [],
  };
}

test("workbench sql memory controller centralizes accepted suggestion and clear commands", () => {
  const events: string[] = [];
  let memory = createMemoryState();

  const controller = createWorkbenchSqlMemoryController({
    connectionId: "conn-a",
    runtimeSchema: "public",
    actions: {
      applyMemory: (next) => {
        memory = next;
        events.push("memory:apply");
      },
      openDialog: () => events.push("dialog:open"),
      closeDialog: () => events.push("dialog:close"),
    },
    recordAcceptedSuggestion: (connectionId, suggestion) => {
      events.push(`accepted:${connectionId}:${suggestion.label}`);
      return {
        sqlMemory: {
          ...createMemoryState(),
          acceptedSuggestions: [
            {
              key: "column:orders.id",
              label: suggestion.label,
              kind: suggestion.kind,
              schema: suggestion.schema ?? null,
              relation: suggestion.relation ?? null,
              column: suggestion.column ?? null,
              count: 1,
              lastAcceptedAt: "2026-05-31T00:00:00.000Z",
            },
          ],
        },
      };
    },
    updateRetention: (connectionId, settings) => {
      events.push(`retention:${connectionId}:${Object.keys(settings)[0]}`);
      return {
        sqlMemory: {
          ...createMemoryState(),
          retention: {
            ...createMemoryState().retention,
            ...settings,
          },
        },
      };
    },
    clearMemory: (connectionId, options) => {
      events.push(
        `clear:${connectionId}:${options?.schema ?? options?.categories?.join(",") ?? "all"}`,
      );
      return { sqlMemory: createMemoryState() };
    },
    showNotification: (notice) => events.push(`notice:${notice.title}`),
  });

  controller.handleCompletionAccepted({
    label: "id",
    kind: "column",
    schema: "public",
    relation: "orders",
    column: "id",
  });
  assert.equal(memory.acceptedSuggestions[0]?.label, "id");

  controller.handleSqlMemoryRetentionChange("trackQueryPatterns", false);
  assert.equal(memory.retention.trackQueryPatterns, false);

  controller.handleClearSqlMemoryCategory("acceptedSuggestions");
  controller.handleClearSqlMemoryCurrentSchema();
  controller.handleClearAllSqlMemory();

  assert.ok(events.includes("accepted:conn-a:id"));
  assert.ok(events.includes("retention:conn-a:trackQueryPatterns"));
  assert.ok(events.includes("clear:conn-a:acceptedSuggestions"));
  assert.ok(events.includes("clear:conn-a:public"));
  assert.ok(events.includes("clear:conn-a:all"));
  assert.ok(events.includes("notice:SQL memory cleared"));
});
