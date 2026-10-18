import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';

export const pool = config.db.url
  ? new Pool({ connectionString: config.db.url })
  : new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
    });

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}
