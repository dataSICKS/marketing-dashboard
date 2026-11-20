import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * 接続は**遅延生成**にしている。
 *
 * import した時点で DATABASE_URL を必須にすると、未設定の環境では
 * APIサーバーが起動すらできない（= 既存のダッシュボードも落ちる）。
 * DBを使うのは認証だけなので、「DBが無い」は認証が使えないという
 * 局所的な失敗として扱い、起動自体は通す。
 */
let pool: pg.Pool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  pool = new Pool({ connectionString });
  database = drizzle(pool, { schema });
  return database;
}

export function getPool(): pg.Pool {
  getDb();
  return pool as pg.Pool;
}

export * from "./schema";
