import { LINTE_V2_TO_CLICKUP } from "../config/statusMappingV2";
import { findTaskByLinteCode, updateTaskStatus, setTaskTextField } from "../services/clickup";
import { logInfo, logError } from "../services/logger";

interface LinteV2StatusPayload {
  linteCode: string;
  statusName: string;
  instanceId: string;
}

export async function handleLinteV2StatusUpdate(payload: LinteV2StatusPayload): Promise<void> {
  const { linteCode, statusName, instanceId } = payload;

  const mapping = LINTE_V2_TO_CLICKUP[statusName];

  const task = await findTaskByLinteCode(linteCode);
  if (!task) {
    if (mapping) {
      await logError("linte-v2→clickup", `Tarefa com código "${linteCode}" não encontrada no ClickUp`, { linteCode, instanceId });
    } else {
      await logInfo("linte-v2→clickup", `Status "${statusName}" sem mapeamento e tarefa "${linteCode}" não encontrada — ignorando`, { linteCode, instanceId });
    }
    return;
  }

  // Persiste o instanceId em QUALQUER webhook da v2 (mesmo de status não mapeado), para que o
  // fluxo ClickUp → Linte v2 (pedido de pagamento) possa usá-lo depois sem consultar a Linte.
  try {
    await setTaskTextField(task.id, "Linte Instance ID", instanceId);
  } catch (err) {
    await logError("linte-v2→clickup", `Falha ao gravar "Linte Instance ID": ${String(err)}`, {
      linteCode,
      taskId: task.id,
      taskName: task.name,
      instanceId,
    });
  }

  if (!mapping) {
    await logInfo("linte-v2→clickup", `Status "${statusName}" sem mapeamento — instanceId gravado, ignorando atualização de status`, {
      linteCode,
      taskId: task.id,
      taskName: task.name,
      instanceId,
    });
    return;
  }

  await updateTaskStatus(task.id, mapping.targetStatus);

  await logInfo("linte-v2→clickup", `Atualizada para "${mapping.targetStatus}"`, {
    linteCode,
    taskId: task.id,
    taskName: task.name,
    instanceId,
  });
}
