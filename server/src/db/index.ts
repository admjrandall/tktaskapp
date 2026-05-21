import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index.js'

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: true } : false,
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

export async function closeDb(): Promise<void> {
  await pool.end()
}
