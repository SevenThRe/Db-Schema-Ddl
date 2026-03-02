import type {
  NameFixJob,
  NameFixJobItem,
  NameFixPreviewResponse,
} from "@shared/schema";

export interface NameFixApplyResultState {
  jobId: string;
  status: string;
  downloadBundleToken?: string;
  downloadBundleFilename?: string;
  successCount: number;
  failedCount: number;
  changedTableCount: number;
  changedColumnCount: number;
  files: Array<{
    fileId: number;
    sourcePath: string;
    outputPath?: string;
    backupPath?: string;
    reportJsonPath?: string;
    reportTextPath?: string;
    downloadToken?: string;
    downloadFilename?: string;
    success: boolean;
    changedTableCount: number;
    changedColumnCount: number;
    skippedChanges: number;
    error?: string;
  }>;
}

export interface NameFixJobDetailState {
  job: NameFixJob;
  items: NameFixJobItem[];
}

export interface NameFixExecutionPanelsProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  nameFixPreviewResult: NameFixPreviewResponse | null;
  nameFixApplyResult: NameFixApplyResultState | null;
  nameFixJobDetail: NameFixJobDetailState | null | undefined;
}
