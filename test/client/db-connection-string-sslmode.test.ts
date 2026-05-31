import test from "node:test";
import assert from "node:assert/strict";
import {
  parseConnectionString,
  parseSslModeToken,
} from "../../client/src/lib/db-connection-string";

test("parseSslModeToken normalizes the common driver spellings", () => {
  assert.equal(parseSslModeToken("require"), "require");
  assert.equal(parseSslModeToken("REQUIRED"), "require");
  assert.equal(parseSslModeToken("verify_ca"), "verify-ca");
  assert.equal(parseSslModeToken("verify-full"), "verify-full");
  assert.equal(parseSslModeToken("VERIFY_IDENTITY"), "verify-full");
  assert.equal(parseSslModeToken("disable"), "disable");
  assert.equal(parseSslModeToken("prefer"), "prefer");
  assert.equal(parseSslModeToken("allow"), "prefer");
  // Unknown / empty tokens leave the default in place.
  assert.equal(parseSslModeToken("nonsense"), undefined);
  assert.equal(parseSslModeToken(""), undefined);
  assert.equal(parseSslModeToken(undefined), undefined);
});

test("parseConnectionString lifts sslmode out of a postgres URL query", () => {
  const parsed = parseConnectionString(
    "postgresql://u:p@db.example.com:5432/app?sslmode=require",
  );
  assert.ok(parsed);
  assert.equal(parsed?.driver, "postgres");
  assert.equal(parsed?.host, "db.example.com");
  assert.equal(parsed?.sslMode, "require");
});

test("parseConnectionString reads MySQL ssl-mode and verify-full URLs", () => {
  const mysql = parseConnectionString(
    "mysql://root:secret@mysql.internal:3306/shop?ssl-mode=VERIFY_IDENTITY",
  );
  assert.equal(mysql?.driver, "mysql");
  assert.equal(mysql?.sslMode, "verify-full");
});

test("parseConnectionString reads sslmode from psql key-value and .env forms", () => {
  const psql = parseConnectionString(
    "host=db.example.com port=5432 dbname=app user=u password=p sslmode=verify-full",
  );
  assert.equal(psql?.sslMode, "verify-full");

  const env = parseConnectionString(
    "DB_HOST=db DB_PORT=5432 DB_NAME=app DB_USER=u DB_PASSWORD=p DB_SSLMODE=require",
  );
  assert.equal(env?.sslMode, "require");
});

test("parseConnectionString leaves sslMode undefined when none is present", () => {
  const parsed = parseConnectionString("postgresql://u:p@host:5432/app");
  assert.ok(parsed);
  assert.equal(parsed?.sslMode, undefined);
});
