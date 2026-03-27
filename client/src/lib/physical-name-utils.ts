export {
  PHYSICAL_NAME_PATTERN,
  applyNameFixPlan,
  autoFixTablePhysicalNames,
  hasInvisibleCharacters,
  isValidPhysicalName,
  normalizePhysicalName,
  validateTablePhysicalNames,
  visualizeInvisibleCharacters,
} from "@shared/physical-name";

export type {
  ColumnNameIssue,
  NameFixConflict,
  NameFixConflictStrategy,
  NameFixDecisionTrace,
  NameFixPlanOptions,
  NameFixPlanResult,
  ReservedWordStrategy,
  LengthOverflowStrategy,
  TableNameValidation,
} from "@shared/physical-name";
