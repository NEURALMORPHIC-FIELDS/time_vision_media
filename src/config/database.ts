import pg from 'pg';
import { config } from './app.js';

const { Pool } = pg;

export let db: pg.Pool;

export async function initDatabase(): Promise<void> {
  db = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Verify connection
  const client = await db.connect();
  try {
    await client.query('SELECT NOW()');
    console.log('[DB] PostgreSQL connected');
  } finally {
    client.release();
  }
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params);
}

export async function getClient(): Promise<pg.PoolClient> {
  return db.connect();
}
