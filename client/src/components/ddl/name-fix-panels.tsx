import { api, buildUrl } from "@shared/routes";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatLogicalPhysicalName,
  renderNameDiffPair,
} from "./name-fix-display-utils";
import type { NameFixExecutionPanelsProps } from "./name-fix-types";

export function NameFixExecutionPanels({
  t,
  nameFixPreviewResult,
  nameFixApplyResult,
  nameFixJobDetail,
}: NameFixExecutionPanelsProps) {
  return (
    <>
      {nameFixPreviewResult && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-semibold">{t("ddl.nameFix.previewSummaryTitle")}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewFiles")}</div>
              <div className="font-semibold">{nameFixPreviewResult.summary.fileCount}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewTablesChanged")}</div>
              <div className="font-semibold">{nameFixPreviewResult.summary.changedTableCount}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewColumnsChanged")}</div>
              <div className="font-semibold">{nameFixPreviewResult.summary.changedColumnCount}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewBlockingConflicts")}</div>
              <div className="font-semibold text-amber-700">{nameFixPreviewResult.summary.blockingConflictCount}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewMissingSourceRef")}</div>
              <div className="font-semibold text-amber-700">{nameFixPreviewResult.summary.unresolvedSourceRefCount}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">{t("ddl.nameFix.previewPlan")}</div>
              <div className="font-mono text-[11px] truncate">{nameFixPreviewResult.planId}</div>
            </div>
          </div>

          <ScrollArea className="h-[180px] border rounded-md p-2">
            <div className="space-y-2">
              {nameFixPreviewResult.files.flatMap((file) =>
                file.tableMappings
                  .filter(
                    (mapping) =>
                      mapping.physicalTableNameBefore !== mapping.physicalTableNameAfter ||
                      mapping.columns.some(
                        (column) => column.physicalNameBefore !== column.physicalNameAfter,
                      ),
                  )
                  .map((mapping) => (
                    <div key={`${file.fileId}-${mapping.sheetName}-${mapping.tableIndex}`} className="rounded border p-2">
                      <div className="text-xs font-semibold">
                        {mapping.sheetName} · {formatLogicalPhysicalName(mapping.logicalTableName, mapping.physicalTableNameBefore)}
                      </div>
                      <div className="text-[11px] font-mono leading-5">
                        {renderNameDiffPair(mapping.physicalTableNameBefore, mapping.physicalTableNameAfter)}
                      </div>
                      {mapping.columns
                        .filter((column) => column.physicalNameBefore !== column.physicalNameAfter)
                        .slice(0, 4)
                        .map((column) => (
                          <div key={column.columnIndex} className="text-[11px] font-mono leading-5">
                            {renderNameDiffPair(column.physicalNameBefore, column.physicalNameAfter)}
                          </div>
                        ))}
                    </div>
                  )),
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {nameFixPreviewResult && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{t("ddl.nameFix.conflictDecisionTitle")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("ddl.nameFix.conflictDecisionStats", {
                conflictCount: nameFixPreviewResult.files.reduce((total, file) => total + file.conflicts.length, 0),
                traceCount: nameFixPreviewResult.files.reduce((total, file) => total + file.decisionTrace.length, 0),
              })}
              {" · "}
            </div>
          </div>
          <ScrollArea className="h-[120px] border rounded-md p-2">
            <div className="space-y-1.5 text-xs">
              {nameFixPreviewResult.files.flatMap((file) => file.conflicts).length === 0 ? (
                <div className="text-muted-foreground">{t("ddl.nameFix.noConflictDetected")}</div>
              ) : (
                nameFixPreviewResult.files.flatMap((file) =>
                  file.conflicts.map((conflict, index) => (
                    <div
                      key={`${file.fileId}-${conflict.target}-${conflict.tableIndex}-${conflict.columnIndex ?? -1}-${index}`}
                      className="rounded border p-2"
                    >
                      <div className={conflict.blocking ? "text-red-700 font-medium" : "text-amber-700 font-medium"}>
                        [{conflict.blocking ? "BLOCKING" : "AUTO"}] {conflict.type}
                      </div>
                      <div className="font-mono text-[11px] break-all">
                        {conflict.currentName} {"->"} {conflict.attemptedName}
                      </div>
                      <div className="text-muted-foreground">{conflict.reason}</div>
                    </div>
                  )),
                )
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {nameFixApplyResult && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-semibold">{t("ddl.nameFix.applyResultTitle")}</div>
          <div className="text-xs">
            {t("ddl.nameFix.jobLabel")}: <span className="font-mono">{nameFixApplyResult.jobId}</span>
          </div>
          {nameFixApplyResult.downloadBundleToken && (
            <div className="text-xs">
              <a
                className="text-primary underline"
                href={buildUrl(api.nameFix.download.path, { token: nameFixApplyResult.downloadBundleToken })}
                download={nameFixApplyResult.downloadBundleFilename || undefined}
              >
                {t("ddl.nameFix.downloadBundleResult")}
              </a>
            </div>
          )}
          <div className="text-xs">
            {t("ddl.nameFix.applySummaryLine", {
              successCount: nameFixApplyResult.successCount,
              failedCount: nameFixApplyResult.failedCount,
              changedTableCount: nameFixApplyResult.changedTableCount,
              changedColumnCount: nameFixApplyResult.changedColumnCount,
            })}
          </div>
          <ScrollArea className="h-[140px] border rounded-md p-2">
            <div className="space-y-1.5 text-xs">
              {nameFixApplyResult.files.map((file) => (
                <div key={`${file.fileId}-${file.sourcePath}`} className="rounded border p-2">
                  <div className="font-mono break-all">{file.sourcePath}</div>
                  <div className={file.success ? "text-emerald-700" : "text-red-700"}>
                    {file.success ? t("ddl.nameFix.fileSuccess") : t("ddl.nameFix.fileFailed")}
                  </div>
                  {file.outputPath && <div>{t("ddl.nameFix.outputLabel")}: <span className="font-mono break-all">{file.outputPath}</span></div>}
                  {file.backupPath && <div>{t("ddl.nameFix.backupLabel")}: <span className="font-mono break-all">{file.backupPath}</span></div>}
                  {file.reportJsonPath && <div>{t("ddl.nameFix.reportJsonLabel")}: <span className="font-mono break-all">{file.reportJsonPath}</span></div>}
                  {file.downloadToken && (
                    <div>
                      <a
                        className="text-primary underline"
                        href={buildUrl(api.nameFix.download.path, { token: file.downloadToken })}
                        download={file.downloadFilename || undefined}
                      >
                        {t("ddl.nameFix.downloadResult")}
                      </a>
                    </div>
                  )}
                  {file.error && <div className="text-red-700">{t("ddl.nameFix.errorLabel")}: {file.error}</div>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {nameFixJobDetail && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-semibold">{t("ddl.nameFix.persistedJobTitle")}</div>
          <div className="text-xs">
            {t("ddl.nameFix.jobLabel")}=<span className="font-mono">{nameFixJobDetail.job.id}</span>
            {" · "}
            {t("ddl.nameFix.statusLabel")}=<span className="font-semibold">{nameFixJobDetail.job.status}</span>
          </div>
          <div className="text-xs">
            {t("ddl.nameFix.jobChangedLine", {
              changedTableCount: nameFixJobDetail.job.changedTableCount,
              changedColumnCount: nameFixJobDetail.job.changedColumnCount,
            })}
          </div>
          {nameFixJobDetail.job.error && (
            <div className="text-xs text-red-700">
              {t("ddl.nameFix.errorLabel")}: {nameFixJobDetail.job.error}
            </div>
          )}
        </div>
      )}
    </>
  );
}

