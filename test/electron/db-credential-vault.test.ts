import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptWithSafeStorageAdapter,
  encryptWithSafeStorageAdapter,
  type SafeStorageAdapter,
} from "../../server/lib/extensions/db-management/credential-vault";

function createAdapter(encryptionAvailable = true): SafeStorageAdapter {
  return {
    isEncryptionAvailable() {
      return encryptionAvailable;
    },
    encryptString(value: string) {
      return Buffer.from(`enc:${value}`, "utf8");
    },
    decryptString(value: Buffer) {
      return value.toString("utf8").replace(/^enc:/, "");
    },
  };
}

test("safeStorage helpers round-trip remembered DB passwords via base64", () => {
  const adapter = createAdapter();

  const encrypted = encryptWithSafeStorageAdapter(adapter, "s3cr3t!");
  const decrypted = decryptWithSafeStorageAdapter(adapter, encrypted);

  assert.equal(decrypted, "s3cr3t!");
});

test("safeStorage helpers reject when OS encryption is unavailable", () => {
  const adapter = createAdapter(false);

  assert.throws(
    () => encryptWithSafeStorageAdapter(adapter, "pw"),
    /OS-backed encryption is unavailable/,
  );
  assert.throws(
    () => decryptWithSafeStorageAdapter(adapter, "ZW5jOnB3"),
    /OS-backed encryption is unavailable/,
  );
});

test("decryptWithSafeStorageAdapter returns undefined for missing ciphertext", () => {
  const adapter = createAdapter();

  assert.equal(decryptWithSafeStorageAdapter(adapter, undefined), undefined);
});
