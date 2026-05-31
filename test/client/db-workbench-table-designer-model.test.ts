import test from "node:test";
import assert from "node:assert/strict";
import type { DbTableSchema } from "../../shared/schema";
import {
  buildCreateTableDdl,
  diffTableDraft,
  emptyTableDraft,
  escapeSqlStringLiteral,
  quoteIdentifier,
  tableDesignChangesToScript,
  tableDraftFromSchema,
  type TableDraft,
} from "../../client/src/components/extensions/db-workbench/table-designer-model";

function usersSchema(): DbTableSchema {
  return {
    name: "users",
    comment: "app users",
    columns: [
      { name: "id", dataType: "int", nullable: false, primaryKey: true },
      { name: "email", dataType: "varchar(255)", nullable: false, primaryKey: false },
      {
        name: "nickname",
        dataType: "varchar(64)",
        nullable: true,
        primaryKey: false,
        comment: "display name",
      },
    ],
  };
}

test("identifier quoting and string escaping are driver-aware and injection-safe", () => {
  assert.equal(quoteIdentifier("user`s", "mysql"), "`user``s`");
  assert.equal(quoteIdentifier('we"ird', "postgres"), '"we""ird"');
  assert.equal(escapeSqlStringLiteral("O'Brien"), "O''Brien");
});

test("buildCreateTableDdl emits MySQL columns, PK, and inline comments", () => {
  const draft = tableDraftFromSchema(usersSchema());
  const ddl = buildCreateTableDdl(draft, "mysql");

  assert.match(ddl, /CREATE TABLE `users` \(/);
  assert.match(ddl, /`id` int NOT NULL/);
  assert.match(ddl, /`email` varchar\(255\) NOT NULL/);
  assert.match(ddl, /`nickname` varchar\(64\).*COMMENT 'display name'/);
  assert.match(ddl, /PRIMARY KEY \(`id`\)/);
  assert.match(ddl, /COMMENT='app users';/);
});

test("buildCreateTableDdl emits PostgreSQL CREATE plus separate COMMENT ON statements", () => {
  const draft = tableDraftFromSchema(usersSchema());
  const ddl = buildCreateTableDdl(draft, "postgres", "app");

  assert.match(ddl, /CREATE TABLE "app"\."users" \(/);
  assert.match(ddl, /"email" varchar\(255\) NOT NULL/);
  assert.match(ddl, /PRIMARY KEY \("id"\)/);
  // Postgres comments are separate statements, not inline.
  assert.doesNotMatch(ddl, /COMMENT '/);
  assert.match(ddl, /COMMENT ON TABLE "app"\."users" IS 'app users';/);
  assert.match(ddl, /COMMENT ON COLUMN "app"\."users"\."nickname" IS 'display name';/);
});

test("diffTableDraft detects added, dropped, and renamed columns (MySQL)", () => {
  const draft = tableDraftFromSchema(usersSchema());
  // rename nickname -> display_name, drop email, add created_at
  const nickname = draft.columns.find((c) => c.originalName === "nickname")!;
  nickname.name = "display_name";
  draft.columns = draft.columns.filter((c) => c.originalName !== "email");
  draft.columns.push({
    id: "new-1",
    name: "created_at",
    dataType: "datetime",
    nullable: false,
    primaryKey: false,
    defaultValue: "CURRENT_TIMESTAMP",
  });

  const changes = diffTableDraft(usersSchema(), draft, "mysql");
  const kinds = changes.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["add-column", "drop-column", "rename-column"]);

  const script = tableDesignChangesToScript(changes);
  assert.match(script, /ALTER TABLE `users` CHANGE COLUMN `nickname` `display_name` varchar\(64\)/);
  assert.match(script, /ALTER TABLE `users` DROP COLUMN `email`;/);
  assert.match(script, /ALTER TABLE `users` ADD COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP;/);
});

test("diffTableDraft emits granular PostgreSQL modifies for type/null/default/comment", () => {
  const original = usersSchema();
  const draft = tableDraftFromSchema(original);
  const email = draft.columns.find((c) => c.originalName === "email")!;
  email.dataType = "text";
  email.nullable = true;
  email.defaultValue = "''";
  email.comment = "primary email";

  const script = tableDesignChangesToScript(diffTableDraft(original, draft, "postgres"));
  assert.match(script, /ALTER TABLE "users" ALTER COLUMN "email" TYPE text;/);
  assert.match(script, /ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;/);
  assert.match(script, /ALTER TABLE "users" ALTER COLUMN "email" SET DEFAULT '';/);
  assert.match(script, /COMMENT ON COLUMN "users"\."email" IS 'primary email';/);
});

test("diffTableDraft detects primary-key and table-comment changes", () => {
  const original = usersSchema();
  const draft = tableDraftFromSchema(original);
  // move PK from id to email, change table comment
  draft.columns.find((c) => c.originalName === "id")!.primaryKey = false;
  draft.columns.find((c) => c.originalName === "email")!.primaryKey = true;
  draft.comment = "registered users";

  const pgScript = tableDesignChangesToScript(diffTableDraft(original, draft, "postgres"));
  assert.match(pgScript, /ALTER TABLE "users" DROP CONSTRAINT "users_pkey";/);
  assert.match(pgScript, /ALTER TABLE "users" ADD PRIMARY KEY \("email"\);/);
  assert.match(pgScript, /COMMENT ON TABLE "users" IS 'registered users';/);

  const myScript = tableDesignChangesToScript(diffTableDraft(original, draft, "mysql"));
  assert.match(myScript, /ALTER TABLE `users` DROP PRIMARY KEY;/);
  assert.match(myScript, /ALTER TABLE `users` ADD PRIMARY KEY \(`email`\);/);
  assert.match(myScript, /ALTER TABLE `users` COMMENT='registered users';/);
});

test("diffTableDraft yields no changes when the draft matches the source", () => {
  const original = usersSchema();
  const draft = tableDraftFromSchema(original);
  assert.equal(diffTableDraft(original, draft, "mysql").length, 0);
  assert.equal(diffTableDraft(original, draft, "postgres").length, 0);
});

function ordersSchema() {
  return {
    name: "orders",
    columns: [
      { name: "id", dataType: "int", nullable: false, primaryKey: true },
      { name: "user_id", dataType: "int", nullable: false, primaryKey: false },
      { name: "code", dataType: "varchar(32)", nullable: false, primaryKey: false },
    ],
    indexes: [
      { name: "pk_orders", columns: ["id"], unique: true, primary: true },
      { name: "uq_code", columns: ["code"], unique: true },
    ],
    foreignKeys: [
      {
        name: "fk_orders_user",
        columns: ["user_id"],
        referencedTable: "users",
        referencedColumns: ["id"],
      },
    ],
  } as const;
}

test("buildCreateTableDdl appends CREATE INDEX and FK constraints, excluding the PK index", () => {
  const draft = tableDraftFromSchema(ordersSchema());
  const ddl = buildCreateTableDdl(draft, "mysql");
  assert.match(ddl, /CREATE TABLE `orders`/);
  assert.match(ddl, /PRIMARY KEY \(`id`\)/);
  assert.match(ddl, /CREATE UNIQUE INDEX `uq_code` ON `orders` \(`code`\);/);
  // The primary-key index must not be re-emitted as a secondary index.
  assert.doesNotMatch(ddl, /INDEX `pk_orders`/);
  assert.match(
    ddl,
    /ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_user` FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`id`\);/,
  );
});

test("diffTableDraft adds, drops, and recreates indexes and foreign keys", () => {
  const original = ordersSchema();
  const draft = tableDraftFromSchema(original);

  // drop uq_code, add a new index, and change the FK's referenced column
  draft.indexes = (draft.indexes ?? []).filter((i) => i.originalName !== "uq_code");
  draft.indexes.push({ id: "ix-new", name: "ix_user", columns: ["user_id"], unique: false });
  const fk = (draft.foreignKeys ?? [])[0]!;
  fk.referencedColumns = ["user_id"];

  const script = tableDesignChangesToScript(diffTableDraft(original, draft, "postgres"));
  assert.match(script, /DROP INDEX "uq_code";/);
  assert.match(script, /CREATE INDEX "ix_user" ON "orders" \("user_id"\);/);
  // FK change = drop + re-add (PostgreSQL drops via DROP CONSTRAINT).
  assert.match(script, /ALTER TABLE "orders" DROP CONSTRAINT "fk_orders_user";/);
  assert.match(
    script,
    /ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY \("user_id"\) REFERENCES "users" \("user_id"\);/,
  );

  // MySQL drops a foreign key with DROP FOREIGN KEY.
  const myScript = tableDesignChangesToScript(diffTableDraft(original, draft, "mysql"));
  assert.match(myScript, /ALTER TABLE `orders` DROP FOREIGN KEY `fk_orders_user`;/);
  assert.match(myScript, /ALTER TABLE `orders` DROP INDEX `uq_code`;/);
});

test("diffTableDraft reports no index/FK changes when unchanged", () => {
  const original = ordersSchema();
  const draft = tableDraftFromSchema(original);
  assert.equal(diffTableDraft(original, draft, "mysql").length, 0);
  assert.equal(diffTableDraft(original, draft, "postgres").length, 0);
});

test("emptyTableDraft starts with no columns and no name", () => {
  const draft: TableDraft = emptyTableDraft();
  assert.equal(draft.name, "");
  assert.equal(draft.columns.length, 0);
});
