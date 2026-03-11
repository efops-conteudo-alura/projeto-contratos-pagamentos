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
      message TEXT NOT NULL
    )
  `;
}
