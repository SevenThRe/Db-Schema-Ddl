type ConnectionIdentity = {
  id: string;
};

export function resolveSchemaDiffTargetConnectionId(input: {
  currentTargetConnectionId: string;
  activeConnectionId: string;
  connections: ConnectionIdentity[];
}): string {
  const compareTargets = input.connections.filter(
    (connection) => connection.id !== input.activeConnectionId,
  );

  if (
    input.currentTargetConnectionId &&
    compareTargets.some((connection) => connection.id === input.currentTargetConnectionId)
  ) {
    return input.currentTargetConnectionId;
  }

  return compareTargets[0]?.id ?? "";
}

export function resolveSyncConnectionIds(input: {
  activeConnectionId: string;
  currentSourceConnectionId: string;
  currentTargetConnectionId: string;
  connections: ConnectionIdentity[];
}): {
  sourceConnectionId: string;
  targetConnectionId: string;
} {
  const availableIds = new Set(input.connections.map((connection) => connection.id));
  const sourceConnectionId =
    input.currentSourceConnectionId && availableIds.has(input.currentSourceConnectionId)
      ? input.currentSourceConnectionId
      : input.activeConnectionId;

  const targetConnectionId =
    input.currentTargetConnectionId &&
    availableIds.has(input.currentTargetConnectionId) &&
    input.currentTargetConnectionId !== sourceConnectionId
      ? input.currentTargetConnectionId
      : input.connections.find((connection) => connection.id !== sourceConnectionId)?.id ??
        sourceConnectionId;

  return {
    sourceConnectionId,
    targetConnectionId,
  };
}
