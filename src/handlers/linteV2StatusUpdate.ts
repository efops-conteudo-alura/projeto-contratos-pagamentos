import { LINTE_V2_TO_CLICKUP } from "../config/statusMappingV2";
import { findTaskByLinteCode, updateTaskStatus, setTaskTextField, addTaskComment } from "../services/clickup";
import { logInfo, logError } from "../services/logger";

interface LinteV2StatusPayload {
  linteCode: string;
  statusName: string;
  instanceId: string;
}

// Quem deve receber o lembrete de pagamento como item de ação (notificação garantida no ClickUp).
const REMINDER_ASSIGNEES: { name: string; id: number }[] = [
  { name: "Vasco Ginde", id: 78890939 },
  { name: "Evelyn Reis", id: 72774719 },
];

// Texto sem nenhuma data (dd/mm ou "<dia> de <mês>") de propósito: assim o próprio lembrete
// não dispara o detector de data do fluxo de comentário (clickupPaymentDate).
const REMINDER_TEXT =
  "📌 Pasta finalizada na Linte — status movido para AGUARDANDO PAGAMENTO. " +
  "Quando a Linte enviar a mensagem com a data prevista de pagamento, cole-a aqui como comentário " +
  "que eu preencho a \"Previsão de pagamento\" automaticamente.";

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

  // Só aplica a transição se a tarefa estiver num status de origem esperado (espelha o Fluxo 1 v1).
  if (mapping.requiredCurrentStatus) {
    const currentNormalized = task.currentStatus.toUpperCase();
    const allowed = Array.isArray(mapping.requiredCurrentStatus)
      ? mapping.requiredCurrentStatus.map((s) => s.toUpperCase())
      : [mapping.requiredCurrentStatus.toUpperCase()];
    if (!allowed.includes(currentNormalized)) {
      const expectedLabel = Array.isArray(mapping.requiredCurrentStatus)
        ? mapping.requiredCurrentStatus.join(" ou ")
        : mapping.requiredCurrentStatus;
      await logInfo(
        "linte-v2→clickup",
        `Transição ignorada: em "${task.currentStatus}", esperado "${expectedLabel}"`,
        { linteCode, taskId: task.id, taskName: task.name, instanceId }
      );
      return;
    }
  }

  await updateTaskStatus(task.id, mapping.targetStatus);

  await logInfo("linte-v2→clickup", `Atualizada para "${mapping.targetStatus}"`, {
    linteCode,
    taskId: task.id,
    taskName: task.name,
    instanceId,
  });

  // Lembrete para o time ir colar manualmente a mensagem de pagamento da Linte.
  // Um comentário atribuído a cada pessoa — assim os dois recebem o item de ação.
  if (mapping.postReminder) {
    for (const assignee of REMINDER_ASSIGNEES) {
      try {
        await addTaskComment(task.id, REMINDER_TEXT, { assignee: assignee.id });
      } catch (err) {
        await logError("linte-v2→clickup", `Falha ao postar lembrete para ${assignee.name}: ${String(err)}`, {
          linteCode,
          taskId: task.id,
          taskName: task.name,
          instanceId,
        });
      }
    }
    await logInfo("linte-v2→clickup", "Lembrete de pagamento postado para o time", {
      linteCode,
      taskId: task.id,
      taskName: task.name,
      instanceId,
    });
  }
}
