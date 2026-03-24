// DB 接続設定型のラウンドトリップテスト（Wave 0 = RED フェーズ）
//
// Task 0 として作成 — Task 1 で DbConnectionConfig に新フィールドが追加されるまで失敗する
// 実行: node --test --experimental-strip-types test/client/db-connection-config.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DbConnectionConfig } from "../../shared/schema.ts";

// ──────────────────────────────────────────────
// ベースとなる接続設定（既存フィールドのみ）
// ──────────────────────────────────────────────

function makeBaseConfig(): DbConnectionConfig {
  return {
    id: "test-conn-1",
    name: "Test Connection",
    driver: "mysql",
    host: "localhost",
    port: 3306,
    database: "test_db",
    username: "root",
    password: "password",
  };
}

// ──────────────────────────────────────────────
// DbConnectionConfig 新フィールドのラウンドトリップテスト
// ──────────────────────────────────────────────

describe("DbConnectionConfig", () => {
  it("environment フィールドのラウンドトリップが正しく動作する", () => {
    const config: DbConnectionConfig = {
      ...makeBaseConfig(),
      environment: "prod",
    };
    const json = JSON.stringify(config);
    const parsed: DbConnectionConfig = JSON.parse(json);
    assert.equal(parsed.environment, "prod");
  });

  it("readonly フィールドのラウンドトリップが正しく動作する", () => {
    const config: DbConnectionConfig = {
      ...makeBaseConfig(),
      readonly: true,
    };
    const json = JSON.stringify(config);
    const parsed: DbConnectionConfig = JSON.parse(json);
    assert.equal(parsed.readonly, true);
  });

  it("colorTag フィールドのラウンドトリップが正しく動作する", () => {
    const config: DbConnectionConfig = {
      ...makeBaseConfig(),
      colorTag: "#ff0000",
    };
    const json = JSON.stringify(config);
    const parsed: DbConnectionConfig = JSON.parse(json);
    assert.equal(parsed.colorTag, "#ff0000");
  });

  it("defaultSchema フィールドのラウンドトリップが正しく動作する", () => {
    const config: DbConnectionConfig = {
      ...makeBaseConfig(),
      defaultSchema: "public",
    };
    const json = JSON.stringify(config);
    const parsed: DbConnectionConfig = JSON.parse(json);
    assert.equal(parsed.defaultSchema, "public");
  });

  it("新フィールドなしの設定は後方互換性を持つ（フィールドが undefined になる）", () => {
    // 旧形式（新フィールドなし）のシリアライズ・デシリアライズ
    const legacyJson = JSON.stringify({
      id: "legacy-conn",
      name: "Legacy",
      driver: "postgres",
      host: "localhost",
      port: 5432,
      database: "db",
      username: "user",
      password: "pass",
    });
    const parsed: DbConnectionConfig = JSON.parse(legacyJson);
    assert.equal(parsed.environment, undefined);
    assert.equal(parsed.readonly, undefined);
    assert.equal(parsed.colorTag, undefined);
    assert.equal(parsed.defaultSchema, undefined);
  });
});
