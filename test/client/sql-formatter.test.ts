// sql-formatter 統合テスト
// EDIT-04: SQL フォーマット機能の Wave 0 テストスタブ
// 実行: node --test --experimental-strip-types test/client/sql-formatter.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { format } from "sql-formatter";

// キーワード大文字化オプション — 実アプリの使用パターンと一致させる
const UPPER_OPTS = { keywordCase: "upper" as const };

describe("sql-formatter integration", () => {
  it("formats a simple SELECT with mysql dialect", () => {
    const input = "select id,name from users where active=1";
    const result = format(input, { language: "mysql", ...UPPER_OPTS });
    assert.ok(result.includes("SELECT"), "Output should contain uppercased SELECT");
    assert.ok(result.includes("\n"), "Output should contain newlines");
  });

  it("formats a simple SELECT with postgresql dialect", () => {
    const input = "select id,name from users where active=true";
    const result = format(input, { language: "postgresql", ...UPPER_OPTS });
    assert.ok(result.includes("SELECT"), "Output should contain uppercased SELECT");
  });

  it("preserves comments during formatting", () => {
    const input = "-- user query\nselect * from users";
    const result = format(input, { language: "sql" });
    assert.ok(result.includes("-- user query"), "Comment should be preserved");
  });

  it("handles multi-statement SQL", () => {
    const input = "select 1;select 2";
    const result = format(input, { language: "sql", ...UPPER_OPTS });
    assert.ok(result.includes("SELECT"), "Should format multi-statement SQL");
  });
});
