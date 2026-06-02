import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../src/db/pool.js';

/** Apply db/schema.sql. Idempotent (CREATE TABLE IF NOT EXISTS). */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

const res = await pool.query(sql);
console.log('schema applied', Array.isArray(res) ? res.length : 'ok');
await pool.end();
