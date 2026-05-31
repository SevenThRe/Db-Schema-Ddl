export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return Array.from(map.values());
}

export function normalizeIdentifierList(input: string): string[] {
  const seen = new Set<string>();
  const identifiers: string[] = [];
  for (const value of input.split(",")) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    identifiers.push(normalized);
  }
  return identifiers;
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function formatColumnPreview(
  columns: string[],
  fallback: string,
  limit = 6,
): string {
  if (columns.length === 0) {
    return fallback;
  }
  if (columns.length <= limit) {
    return columns.join(", ");
  }
  return `${columns.slice(0, limit).join(", ")} +${columns.length - limit} more`;
}
