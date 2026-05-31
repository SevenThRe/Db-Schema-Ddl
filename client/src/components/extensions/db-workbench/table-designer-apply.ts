// Pure apply-policy layer for the visual table designer.
//
// The designer generates a DDL script (CREATE for a new table, or a minimal
// ALTER set for an edit). Before that script is handed to the existing query
// execution + dangerous-SQL confirmation path, this layer decides whether the
// apply is even allowed and whether it must go through dangerous-SQL
// confirmation. Keeping it pure makes the safety policy unit-testable without a
// live database.

export interface TableDesignApplyPlan {
  /** True when the script may be sent to the executor. */
  allowed: boolean;
  /** Operator-facing reason when allowed is false. */
  blockedReason?: string;
  /** The DDL script to execute (unchanged from the generator). */
  script: string;
  /**
   * True when the script contains structure-destructive statements (ALTER /
   * DROP) and must route through the dangerous-SQL confirmation gate. A pure
   * CREATE of a brand-new table is not flagged.
   */
  requiresDangerousConfirmation: boolean;
}

const STRUCTURE_DESTRUCTIVE = /\b(ALTER|DROP|TRUNCATE|RENAME)\b/i;

export function planTableDesignApply(input: {
  script: string;
  readonly: boolean;
}): TableDesignApplyPlan {
  const script = input.script.trim();

  if (!script) {
    return {
      allowed: false,
      blockedReason: "没有需要应用的结构变更。",
      script,
      requiresDangerousConfirmation: false,
    };
  }

  if (input.readonly) {
    return {
      allowed: false,
      blockedReason: "当前连接为只读，已阻止结构变更（DDL）。如需修改请改用可写连接。",
      script,
      requiresDangerousConfirmation: false,
    };
  }

  return {
    allowed: true,
    script,
    requiresDangerousConfirmation: STRUCTURE_DESTRUCTIVE.test(script),
  };
}
