interface NameDiffSegments {
  prefix: string;
  beforeChanged: string;
  afterChanged: string;
  suffix: string;
}

export function formatLogicalPhysicalName(
  logicalName?: string,
  physicalName?: string,
): string {
  const logical = (logicalName ?? "").trim();
  const physical = (physicalName ?? "").trim();

  if (logical && physical) {
    if (logical === physical) {
      return logical;
    }
    return `${logical} (${physical})`;
  }
  return logical || physical || "(unnamed)";
}

export function parseUploadedAtMillis(uploadedAt?: string | Date | null): number {
  if (!uploadedAt) {
    return 0;
  }
  if (uploadedAt instanceof Date) {
    return Number.isNaN(uploadedAt.getTime()) ? 0 : uploadedAt.getTime();
  }

  const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const normalized = sqliteUtcPattern.test(uploadedAt)
    ? `${uploadedAt.replace(" ", "T")}Z`
    : uploadedAt;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function getSheetNameValue(sheet: unknown): string {
  if (typeof sheet === "string") {
    return sheet;
  }
  if (
    sheet
    && typeof sheet === "object"
    && "name" in sheet
    && typeof (sheet as { name?: unknown }).name === "string"
  ) {
    return (sheet as { name: string }).name;
  }
  return "";
}

function splitNameDiff(before: string, after: string): NameDiffSegments {
  if (before === after) {
    return {
      prefix: before,
      beforeChanged: "",
      afterChanged: "",
      suffix: "",
    };
  }

  let prefixLength = 0;
  const minLength = Math.min(before.length, after.length);
  while (prefixLength < minLength && before[prefixLength] === after[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const beforeRemaining = before.length - prefixLength;
  const afterRemaining = after.length - prefixLength;
  while (
    suffixLength < beforeRemaining &&
    suffixLength < afterRemaining &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const beforeEnd = before.length - suffixLength;
  const afterEnd = after.length - suffixLength;

  return {
    prefix: before.slice(0, prefixLength),
    beforeChanged: before.slice(prefixLength, beforeEnd),
    afterChanged: after.slice(prefixLength, afterEnd),
    suffix: before.slice(beforeEnd),
  };
}

export function renderNameDiffPair(beforeName: string, afterName: string) {
  const segments = splitNameDiff(beforeName, afterName);
  if (beforeName === afterName) {
    return <span className="text-muted-foreground">{beforeName}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center">
        {segments.prefix && <span className="text-muted-foreground">{segments.prefix}</span>}
        <span className="rounded bg-rose-100 px-0.5 text-rose-700 line-through decoration-rose-700">
          {segments.beforeChanged || "(empty)"}
        </span>
        {segments.suffix && <span className="text-muted-foreground">{segments.suffix}</span>}
      </span>
      <span className="text-muted-foreground">{"->"}</span>
      <span className="inline-flex items-center">
        {segments.prefix && <span className="text-muted-foreground">{segments.prefix}</span>}
        <span className="rounded bg-emerald-100 px-0.5 text-emerald-700 font-semibold">
          {segments.afterChanged || "(empty)"}
        </span>
        {segments.suffix && <span className="text-muted-foreground">{segments.suffix}</span>}
      </span>
    </span>
  );
}

