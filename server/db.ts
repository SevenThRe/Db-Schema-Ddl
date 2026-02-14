import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import pg from "pg";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

const { Pool } = pg;

// Electron 環境では SQLite、Web 環境では PostgreSQL を使用
const isElectron = process.env.ELECTRON_MODE === 'true';

let db: any;
let pool: any = null;
let sqlite: any = null;

if (isElectron) {
  // SQLite データベースファイルのパス（userData ディレクトリ内）
  const dbDir = process.env.DB_PATH || path.join(process.cwd(), 'data');

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'database.sqlite');
  console.log(`Using SQLite database at: ${dbPath}`);

  // SQLite データベース接続
  sqlite = new Database(dbPath);

  // WAL モードを有効化（パフォーマンス向上）
  sqlite.pragma('journal_mode = WAL');

  db = drizzleSqlite(sqlite, { schema });
} else {
  // PostgreSQL データベース接続（Web 版）
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool, { schema });
}

// データベース接続をクリーンアップする関数
export function closeDatabase() {
  if (sqlite) {
    console.log('Closing SQLite database...');
    sqlite.close();
    sqlite = null;
  }
  if (pool) {
    console.log('Closing PostgreSQL pool...');
    pool.end();
    pool = null;
  }
}

export { db, pool };

