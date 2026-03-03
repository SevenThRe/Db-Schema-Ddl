import { DEFAULT_DDL_SETTINGS_VALUES } from "@shared/config";

export const DDL_RUNTIME_DEFAULTS = {
  zipCompressionLevel: 9,
  streamQueryTruthyValues: ["1", "true"],
  zipFilenamePrefix: "ddl",
  zipFilenameSeparator: "_",
  zipFilenameExtension: ".zip",
  zipFallbackSheetNameLength: 64,
  zipErrorReportFilename: "__export_errors.txt",
  zipErrorReportLineBreak: "\n",
  zipErrorReportTitle: "DDL export completed with tolerated errors.",
  tolerantZipAllFailedMessage: "No DDL files could be generated. All selected tables failed validation.",
  zipGenerateFailedMessage: "Failed to generate ZIP",
  zipDisconnectMessage: "Client disconnected during ZIP export",
  streamDdlErrorPrefix: "[ddl-stream] stream failed after headers sent:",
  streamDdlByReferenceErrorPrefix: "[ddl-stream-by-reference] stream failed after headers sent:",
  zipExportByReferenceErrorPrefix: "ZIP export by reference error:",
  zipExportErrorPrefix: "ZIP export error:",
  exportFilenamePrefix: DEFAULT_DDL_SETTINGS_VALUES.exportFilenamePrefix,
  exportFilenameSuffix: DEFAULT_DDL_SETTINGS_VALUES.exportFilenameSuffix,
  exportAuthorName: DEFAULT_DDL_SETTINGS_VALUES.authorName,
} as const;

export const DDL_STREAM_QUERY_TRUE_VALUES = new Set<string>(
  DDL_RUNTIME_DEFAULTS.streamQueryTruthyValues,
);
