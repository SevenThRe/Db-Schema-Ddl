import { z } from "zod";

export const desktopDiagnosticSeveritySchema = z.enum(["info", "warn", "error"]);
export const desktopDiagnosticCategorySchema = z.enum([
  "startup",
  "workspace-entry",
  "recovery",
  "verification",
  "ship-gate",
]);

export const desktopDiagnosticEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  severity: desktopDiagnosticSeveritySchema,
  category: desktopDiagnosticCategorySchema,
  code: z.string().min(1),
  message: z.string().min(1),
  entityKey: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type DesktopDiagnosticEntry = z.infer<typeof desktopDiagnosticEntrySchema>;

export const desktopSmokeStepStatusSchema = z.enum([
  "passed",
  "failed",
  "warning",
  "skipped",
]);

export const desktopSmokeStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: desktopSmokeStepStatusSchema,
  detail: z.string().optional(),
  diagnosticIds: z.array(z.string().min(1)).default([]),
});

export type DesktopSmokeStep = z.infer<typeof desktopSmokeStepSchema>;

export const desktopSmokeLogExcerptSchema = z.object({
  path: z.string().min(1),
  excerpt: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export type DesktopSmokeLogExcerpt = z.infer<typeof desktopSmokeLogExcerptSchema>;

export const desktopSmokeBlockerFindingSchema = z.object({
  code: z.string().min(1),
  blocker: z.boolean(),
  severity: z.enum(["warning", "critical"]),
  message: z.string().min(1),
  artifactPath: z.string().min(1).optional(),
});

export type DesktopSmokeBlockerFinding = z.infer<typeof desktopSmokeBlockerFindingSchema>;

export const desktopSmokeSummarySchema = z.object({
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  overallStatus: z.enum(["passed", "warning", "failed"]),
});

export const desktopSmokeRunModeSchema = z.enum(["dev-tauri", "packaged-tauri"]);
export type DesktopSmokeRunMode = z.infer<typeof desktopSmokeRunModeSchema>;

export const smokeRecoveryClassificationSchema = z.enum([
  "restored",
  "missing-fallback",
  "none",
]);
export type SmokeRecoveryClassification = z.infer<
  typeof smokeRecoveryClassificationSchema
>;

export const smokeCheckpointSchema = z.object({
  name: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SmokeCheckpoint = z.infer<typeof smokeCheckpointSchema>;

export const desktopSmokeArtifactSchema = z.object({
  artifactVersion: z.enum(["v1", "v2"]).default("v2"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  appVersion: z.string().min(1),
  environment: desktopSmokeRunModeSchema,
  runMode: desktopSmokeRunModeSchema,
  logPath: z.string().min(1),
  executablePath: z.string().min(1).optional(),
  screenshotPaths: z.array(z.string().min(1)).default([]),
  observedCheckpoints: z.array(smokeCheckpointSchema).default([]),
  recoveryClassification: smokeRecoveryClassificationSchema.optional(),
  logExcerpt: desktopSmokeLogExcerptSchema.optional(),
  blockerFindings: z.array(desktopSmokeBlockerFindingSchema).default([]),
  diagnostics: z.array(desktopDiagnosticEntrySchema).default([]),
  steps: z.array(desktopSmokeStepSchema).min(1),
  summary: desktopSmokeSummarySchema,
});

export type DesktopSmokeArtifact = z.infer<typeof desktopSmokeArtifactSchema>;

export const liveVerificationFlowIdSchema = z.enum([
  "connect",
  "query",
  "paging",
  "export",
  "cancel",
  "edit",
  "readonly",
  "inspection",
]);

export const liveVerificationFlowSchema = z.object({
  id: liveVerificationFlowIdSchema,
  status: desktopSmokeStepStatusSchema,
  note: z.string().optional(),
});

export type LiveVerificationFlow = z.infer<typeof liveVerificationFlowSchema>;

export const workbenchLiveVerificationArtifactSchema = z.object({
  artifactVersion: z.enum(["v1", "v2"]).default("v1"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  driver: z.enum(["mysql", "postgres"]),
  connectionLabel: z.string().min(1).optional(),
  database: z.string().min(1).optional(),
  readonly: z.boolean().optional(),
  flows: z.array(liveVerificationFlowSchema).min(8),
  summary: desktopSmokeSummarySchema,
  notes: z.array(z.string().min(1)).default([]),
});

export type WorkbenchLiveVerificationArtifact = z.infer<
  typeof workbenchLiveVerificationArtifactSchema
>;

export const liveVerificationPrereqCheckIdSchema = z.enum([
  "connection-input",
  "bootstrap-config",
  "tcp-connectivity",
]);

export const liveVerificationPrereqCheckSchema = z.object({
  id: liveVerificationPrereqCheckIdSchema,
  status: desktopSmokeStepStatusSchema,
  note: z.string().optional(),
});

export type LiveVerificationPrereqCheck = z.infer<
  typeof liveVerificationPrereqCheckSchema
>;

export const workbenchLiveVerificationPrereqArtifactSchema = z.object({
  artifactVersion: z.enum(["v1"]).default("v1"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  driver: z.enum(["mysql", "postgres"]),
  connectionLabel: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  database: z.string().min(1).optional(),
  readonly: z.boolean().optional(),
  checks: z.array(liveVerificationPrereqCheckSchema).min(1),
  summary: desktopSmokeSummarySchema,
  notes: z.array(z.string().min(1)).default([]),
});

export type WorkbenchLiveVerificationPrereqArtifact = z.infer<
  typeof workbenchLiveVerificationPrereqArtifactSchema
>;

export const releaseDecisionSchema = z.enum(["ready", "blocked"]);

export const releaseShipGateFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["warning", "blocking"]),
  message: z.string().min(1),
  artifactPath: z.string().min(1).optional(),
});

export type ReleaseShipGateFinding = z.infer<
  typeof releaseShipGateFindingSchema
>;

export const releaseExitEvidenceKeySchema = z.enum([
  "packaged-smoke",
  "mysql-live",
  "postgres-live",
  "late-hardening",
]);
export type ReleaseExitEvidenceKey = z.infer<
  typeof releaseExitEvidenceKeySchema
>;

export const releaseExitEvidenceStatusSchema = z.enum([
  "current",
  "warning",
  "failed",
  "missing",
  "stale",
]);
export type ReleaseExitEvidenceStatus = z.infer<
  typeof releaseExitEvidenceStatusSchema
>;

export const releaseExitEvidenceItemSchema = z.object({
  key: releaseExitEvidenceKeySchema,
  label: z.string().min(1),
  required: z.boolean().default(true),
  status: releaseExitEvidenceStatusSchema,
  generatedAt: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional(),
  blockerCodes: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
});
export type ReleaseExitEvidenceItem = z.infer<
  typeof releaseExitEvidenceItemSchema
>;

export const lateHardeningVerificationArtifactSchema = z.object({
  phase: z.string().min(1),
  status: z.string().min(1),
  verifiedAt: z.string().min(1),
  verificationPath: z.string().min(1),
});
export type LateHardeningVerificationArtifact = z.infer<
  typeof lateHardeningVerificationArtifactSchema
>;

export const releaseExitChecklistArtifactSchema = z.object({
  artifactVersion: z.enum(["v1"]).default("v1"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  installerPath: z.string().min(1).optional(),
  installerMtime: z.string().min(1).optional(),
  decision: releaseDecisionSchema,
  blocked: z.boolean(),
  evidence: z.object({
    packagedSmoke: releaseExitEvidenceItemSchema,
    mysqlLive: releaseExitEvidenceItemSchema,
    postgresLive: releaseExitEvidenceItemSchema,
    lateHardening: releaseExitEvidenceItemSchema,
  }),
  missingEvidence: z.array(releaseExitEvidenceKeySchema).default([]),
  staleEvidence: z.array(releaseExitEvidenceKeySchema).default([]),
  shipBlockers: z.array(releaseShipGateFindingSchema).default([]),
  postReleaseBacklog: z.array(z.string().min(1)).default([]),
});
export type ReleaseExitChecklistArtifact = z.infer<
  typeof releaseExitChecklistArtifactSchema
>;

export const releaseShipGateArtifactSchema = z.object({
  artifactVersion: z.enum(["v1", "v2"]).default("v1"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  decision: releaseDecisionSchema,
  blocked: z.boolean(),
  blockers: z.array(releaseShipGateFindingSchema).default([]),
  warnings: z.array(releaseShipGateFindingSchema).default([]),
  packagedSmokeArtifactPath: z.string().min(1).optional(),
  liveArtifactPaths: z.array(z.string().min(1)).default([]),
  lateHardeningArtifactPath: z.string().min(1).optional(),
  requiredEvidence: z.object({
    packagedSmokePresent: z.boolean(),
    mysqlLivePresent: z.boolean(),
    postgresLivePresent: z.boolean(),
    lateHardeningPresent: z.boolean().default(false),
  }),
  missingEvidence: z.array(releaseExitEvidenceKeySchema).default([]),
  staleEvidence: z.array(releaseExitEvidenceKeySchema).default([]),
  shipBlockers: z.array(releaseShipGateFindingSchema).default([]),
  releaseExitChecklistPath: z.string().min(1).optional(),
  releaseExitChecklist: releaseExitChecklistArtifactSchema.optional(),
});

export type ReleaseShipGateArtifact = z.infer<
  typeof releaseShipGateArtifactSchema
>;
