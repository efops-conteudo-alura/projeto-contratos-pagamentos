import { LINTE_V2_TO_CLICKUP } from "../config/statusMappingV2";
import { findTaskByLinteCode, updateTaskStatus } from "../services/clickup";
import { logInfo, logError } from "../services/logger";

interface LinteV2StatusPayload {
  linteCode: string;
  statusName: string;
}

export async function handleLinteV2StatusUpdate(payload: LinteV2StatusPayload): Promise<void> {
  const { linteCode, statusName } = payload;

  const mapping = LINTE_V2_TO_CLICKUP[statusName];
  if (!mapping) {
    await logInfo("linte-v2→clickup", `Status "${statusName}" sem mapeamento — ignorando`, { linteCode });
    return;
  }

  const task = await findTaskByLinteCode(linteCode);
  if (!task) {
    await logError("linte-v2→clickup", `Tarefa com código "${linteCode}" não encontrada no ClickUp`, { linteCode });
    return;
  }

  await updateTaskStatus(task.id, mapping.targetStatus);
  await logInfo("linte-v2→clickup", `Atualizada para "${mapping.targetStatus}"`, {
    linteCode,
    taskId: task.id,
    taskName: task.name,
  });
}
