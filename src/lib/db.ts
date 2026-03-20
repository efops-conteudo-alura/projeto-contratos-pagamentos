import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.POSTGRES_URL!);

export async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS automation_log (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      level TEXT NOT NULL CHECK (level IN ('info', 'error')),
      flow TEXT NOT NULL CHECK (flow IN ('linte→clickup', 'clickup→linte')),
      linte_code TEXT,
      task_id TEXT,
      task_name TEXT,
      message TEXT NOT NULL
    )
  `;
  await sql`ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS task_name TEXT`;
}

export async function ensurePaymentQueueSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS payment_queue (
      id SERIAL PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      linte_code TEXT,
      instructor_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      sent BOOLEAN DEFAULT FALSE
    )
  `;
}
