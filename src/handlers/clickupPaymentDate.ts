import { getTask, setTaskDateField } from "../services/clickup";
import { extractPaymentDate } from "../lib/paymentDate";
import { logInfo, logError } from "../services/logger";

interface ClickUpCommentPayload {
  task_id: string;
  history_items?: {
    comment?: {
      text_content: string;
    };
  }[];
}

// Fluxo 1b (parte manual): quando alguém cola na tarefa a mensagem de pagamento vinda da Linte
// (ex.: "Pagamento programado para 25/Junho"), lê a data e preenche "Previsão de pagamento".
// Só age se o comentário tiver palavra-chave de pagamento E uma data — qualquer outro comentário
// (inclusive o próprio lembrete do bot, que não tem data) é ignorado silenciosamente.
export async function handleClickUpPaymentDate(payload: ClickUpCommentPayload): Promise<void> {
  const commentText = payload.history_items?.[0]?.comment?.text_content ?? "";
  const parsed = extractPaymentDate(commentText);
  if (!parsed) return;

  const task = await getTask(payload.task_id);
  if (!task) {
    await logError("linte-v2→clickup", `Tarefa ${payload.task_id} não encontrada`, { taskId: payload.task_id });
    return;
  }

  const linteCodeField = task.custom_fields.find((f) => f.name === "Código Linte");
  const linteCode = typeof linteCodeField?.value === "string" ? linteCodeField.value : undefined;

  try {
    await setTaskDateField(task.id, "Previsão de pagamento", parsed.timestampMs);
    await logInfo(
      "linte-v2→clickup",
      `Previsão de pagamento definida para ${parsed.day}/${parsed.month}/${parsed.year}`,
      { linteCode, taskId: task.id, taskName: task.name }
    );
  } catch (err) {
    await logError("linte-v2→clickup", `Erro ao preencher previsão: ${String(err)}`, {
      linteCode,
      taskId: task.id,
      taskName: task.name,
    });
  }
}
