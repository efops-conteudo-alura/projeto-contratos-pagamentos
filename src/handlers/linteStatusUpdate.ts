import { LINTE_TO_CLICKUP } from "../config/statusMapping";
import { findTaskByLinteCode, updateTaskStatus } from "../services/clickup";

interface LinteWebhookPayload {
  eventType: string;
  requisition: {
    id: string;
    status: {
      id: string;
      label: string;
      statusCategoryId: string;
    };
  };
}

export async function handleLinteStatusUpdate(payload: LinteWebhookPayload): Promise<void> {
  const { requisition } = payload;
  const linteCode = requisition.id;
  const linteStatusLabel = requisition.status.label;

  const clickupStatus = LINTE_TO_CLICKUP[linteStatusLabel];
  if (!clickupStatus) {
    console.log(`[linte] Status "${linteStatusLabel}" sem mapeamento — ignorando`);
    return;
  }

  const task = await findTaskByLinteCode(linteCode);
  if (!task) {
    console.error(`[linte] Nenhuma tarefa encontrada no ClickUp com Código Linte = "${linteCode}"`);
    return;
  }

  await updateTaskStatus(task.id, clickupStatus);
  console.log(`[linte] Tarefa ${task.id} atualizada para "${clickupStatus}"`);
}
