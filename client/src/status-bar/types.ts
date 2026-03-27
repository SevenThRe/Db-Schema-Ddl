export type StatusBarTone = "default" | "success" | "warning" | "error" | "progress";
export type StatusBarAlign = "left" | "right";

export interface StatusBarEntryInput {
  id: string;
  label: string;
  detail?: string;
  tone?: StatusBarTone;
  align?: StatusBarAlign;
  order?: number;
  progress?: number | null;
  mono?: boolean;
  expiresInMs?: number;
}

export interface StatusBarEntry extends Omit<StatusBarEntryInput, "expiresInMs"> {
  key: string;
  scope: string;
  updatedAt: number;
  expiresAt: number | null;
}

export interface StatusBarController {
  setItem(scope: string, item: StatusBarEntryInput): () => void;
  removeItem(scope: string, id: string): void;
  clearScope(scope: string): void;
}
