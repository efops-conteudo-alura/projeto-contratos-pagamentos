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

  const mapping = LINTE_TO_CLICKUP[linteStatusLabel];
  if (!mapping) {
    await logInfo("linte→clickup", `Status "${linteStatusLabel}" sem mapeamento — ignorando`, { linteCode });
    return;
  }

  const task = await findTaskByLinteCode(linteCode);
  if (!task) {
    return;
  }

  if (mapping.requiredCurrentStatus) {
    const currentNormalized = task.currentStatus.toUpperCase();
    const requiredNormalized = mapping.requiredCurrentStatus.toUpperCase();
    if (currentNormalized !== requiredNormalized) {
      await logInfo(
        "linte→clickup",
        `Transição ignorada: tarefa ${task.id} está em "${task.currentStatus}", esperado "${mapping.requiredCurrentStatus}"`,
        { linteCode, taskId: task.id }
      );
      return;
    }
  }

  await updateTaskStatus(task.id, mapping.targetStatus);
  await logInfo("linte→clickup", `Tarefa ${task.id} atualizada para "${mapping.targetStatus}"`, { linteCode, taskId: task.id });
}
