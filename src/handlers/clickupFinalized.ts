import { getTask } from "../services/clickup";
import { sql } from "../lib/db";
import { logInfo, logError } from "../services/logger";

export async function handleClickUpFinalized(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) {
    await logError("clickup→linte", "Tarefa não encontrada ao processar FINALIZADO", { taskId });
    return;
  }

  const linteCodeField = task.custom_fields.find((f) => f.name === "Código Linte");
  const instructorField = task.custom_fields.find((f) => f.name === "Instrutor(a)");

  const linteCode = typeof linteCodeField?.value === "string" ? linteCodeField.value : null;
  const instructorName = typeof instructorField?.value === "string" ? instructorField.value : null;

  try {
    await sql`
      INSERT INTO payment_queue (task_id, linte_code, instructor_name)
      VALUES (${taskId}, ${linteCode}, ${instructorName})
      ON CONFLICT (task_id) DO NOTHING
    `;
    await logInfo("clickup→linte", `${instructorName ?? taskId} | ${linteCode ?? "sem código"} adicionado à fila de pagamento`, { taskId, linteCode: linteCode ?? undefined });
  } catch (err) {
    await logError("clickup→linte", `Erro ao inserir na fila de pagamento: ${err}`, { taskId });
  }
}
