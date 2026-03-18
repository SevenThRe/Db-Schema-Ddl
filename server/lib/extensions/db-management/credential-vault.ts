export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const ELECTRON_ONLY_MESSAGE =
  "DB credential storage is only available in Electron mode.";

export function encryptWithSafeStorageAdapter(
  adapter: SafeStorageAdapter,
  plainText: string,
): string {
  if (!adapter.isEncryptionAvailable()) {
    throw new Error("OS-backed encryption is unavailable.");
  }
  return adapter.encryptString(plainText).toString("base64");
}

export function decryptWithSafeStorageAdapter(
  adapter: SafeStorageAdapter,
  cipherTextBase64?: string,
): string | undefined {
  if (!cipherTextBase64) {
    return undefined;
  }
  if (!adapter.isEncryptionAvailable()) {
    throw new Error("OS-backed encryption is unavailable.");
  }
  return adapter.decryptString(Buffer.from(cipherTextBase64, "base64"));
}

async function getSafeStorageAdapter(): Promise<SafeStorageAdapter> {
  if (process.env.ELECTRON_MODE !== "true") {
    throw new Error(ELECTRON_ONLY_MESSAGE);
  }

  const { safeStorage } = await import("electron");
  return safeStorage;
}

export async function encryptDbPassword(plainText: string): Promise<string> {
  const adapter = await getSafeStorageAdapter();
  return encryptWithSafeStorageAdapter(adapter, plainText);
}

export async function decryptDbPassword(cipherTextBase64?: string): Promise<string | undefined> {
  const adapter = await getSafeStorageAdapter();
  return decryptWithSafeStorageAdapter(adapter, cipherTextBase64);
}
