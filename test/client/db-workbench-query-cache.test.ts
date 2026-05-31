import test from "node:test";
import assert from "node:assert/strict";

import {
  CONNECTIONS_QUERY_KEY,
  DB_CONNECTIONS_QUERY_KEY,
  SETTINGS_QUERY_KEY,
  invalidateConnectionQueries,
  invalidateSettingsQuery,
} from "../../client/src/components/extensions/db-workbench/workbench-query-cache";

test("workbench query cache centralizes settings and connection query keys", async () => {
  const invalidated: readonly unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      invalidated.push(queryKey);
    },
  };

  await invalidateSettingsQuery(queryClient);
  await invalidateConnectionQueries(queryClient);

  assert.deepEqual(SETTINGS_QUERY_KEY, ["/api/settings"]);
  assert.deepEqual(CONNECTIONS_QUERY_KEY, ["connections"]);
  assert.deepEqual(DB_CONNECTIONS_QUERY_KEY, ["/db/connections"]);
  assert.deepEqual(invalidated, [
    SETTINGS_QUERY_KEY,
    CONNECTIONS_QUERY_KEY,
    DB_CONNECTIONS_QUERY_KEY,
  ]);
});
