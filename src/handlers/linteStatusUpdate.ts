import { LINTE_TO_CLICKUP } from "../config/statusMapping";
import { findTaskByLinteCode, updateTaskStatus } from "../services/clickup";
import { logInfo } from "../services/logger";

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
    await logInfo("linte→clickup", `Status "${linteStatusLabel}" sem mapeamento — ignorando`, { linteCode });
    return;
  }

  const task = await findTaskByLinteCode(linteCode);
  if (!task) {
    return;
  }

  await updateTaskStatus(task.id, clickupStatus);
  await logInfo("linte→clickup", `Tarefa ${task.id} atualizada para "${clickupStatus}"`, { linteCode, taskId: task.id });
}
