export const HTTP_HEADER_NAMES = {
  contentType: "Content-Type",
  contentDisposition: "Content-Disposition",
  transferEncoding: "Transfer-Encoding",
  parseMode: "X-Parse-Mode",
  zipExportSuccessCount: "X-Zip-Export-Success-Count",
  zipExportSkippedCount: "X-Zip-Export-Skipped-Count",
  zipPartialExport: "X-Zip-Partial-Export",
  zipExportSkippedTables: "X-Zip-Export-Skipped-Tables",
  nameFixJobId: "X-NameFix-JobId",
  nameFixPlanHash: "X-NameFix-PlanHash",
  nameFixChangedTables: "X-NameFix-Changed-Tables",
  nameFixChangedColumns: "X-NameFix-Changed-Columns",
} as const;

export const HTTP_HEADER_VALUES = {
  contentTypeZip: "application/zip",
  contentTypePlainTextUtf8: "text/plain; charset=utf-8",
  transferEncodingChunked: "chunked",
} as const;

