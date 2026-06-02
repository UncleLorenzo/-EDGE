import pg from 'pg';
import { config } from '../config.js';

/** Single shared Postgres pool. System of record for money — see db/schema.sql. */
export const pool = new pg.Pool({
  connectionString: config.db.url || undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never);
  return res.rows;
}
