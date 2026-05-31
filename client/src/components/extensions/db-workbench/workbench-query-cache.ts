export const CONNECTIONS_QUERY_KEY = ["connections"] as const;
export const DB_CONNECTIONS_QUERY_KEY = ["/db/connections"] as const;
export const SETTINGS_QUERY_KEY = ["/api/settings"] as const;

export interface WorkbenchQueryInvalidator {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown> | unknown;
}

export async function invalidateSettingsQuery(
  queryClient: WorkbenchQueryInvalidator,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
}

export async function invalidateConnectionQueries(
  queryClient: WorkbenchQueryInvalidator,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: DB_CONNECTIONS_QUERY_KEY }),
  ]);
}
