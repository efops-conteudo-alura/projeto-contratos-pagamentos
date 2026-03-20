import { sql } from "../lib/db";

type Flow = "linte→clickup" | "clickup→linte";
type Context = { linteCode?: string; taskId?: string; taskName?: string };

async function insertLog(
  level: "info" | "error",
  flow: Flow,
  message: string,
  context?: Context
): Promise<void> {
  try {
    await sql`
      INSERT INTO automation_log (level, flow, linte_code, task_id, task_name, message)
      VALUES (${level}, ${flow}, ${context?.linteCode ?? null}, ${context?.taskId ?? null}, ${context?.taskName ?? null}, ${message})
    `;
  } catch (err) {
    console.error("[logger] Falha ao inserir log no banco:", err);
  }
}

export async function logInfo(flow: Flow, message: string, context?: Context): Promise<void> {
  console.log(`[${flow}] ${message}`, context ?? "");
  await insertLog("info", flow, message, context);
}

export async function logError(flow: Flow, message: string, context?: Context): Promise<void> {
  console.error(`[${flow}] ${message}`, context ?? "");
  await insertLog("error", flow, message, context);
}
