import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: DB;
  kind: 'postgres' | 'pglite';
  close: () => Promise<void>;
}

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * DATABASE_URL=postgres://...  → real PostgreSQL (production, Docker)
 * DATABASE_URL=pglite:./.data   → embedded Postgres saved to a folder (zero-setup dev)
 * no DATABASE_URL / "memory"    → embedded in-memory Postgres (tests, quick demo)
 */
export async function openDatabase(url = process.env.DATABASE_URL): Promise<Database> {
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    // A dropped idle connection must not crash the server; the pool replaces it.
    pool.on('error', (err) => console.error('PostgreSQL connection error:', err.message));
    const db = drizzlePg(pool, { schema });
    try {
      await migratePg(db, { migrationsFolder: MIGRATIONS });
    } catch (err) {
      await pool.end().catch(() => undefined);
      throw err;
    }
    return { db: db as unknown as DB, kind: 'postgres', close: () => pool.end() };
  }
  const dir = url?.startsWith('pglite:') ? url.slice('pglite:'.length) : undefined;
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as DB, kind: 'pglite', close: () => client.close() };
}

export { schema };
