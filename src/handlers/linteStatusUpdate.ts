import { LINTE_TO_CLICKUP } from "../config/statusMapping";
import { findTaskByLinteCode, updateTaskStatus, setTaskDateField, addTaskComment } from "../services/clickup";
import { getRequisitionMessages } from "../services/linte";
import { logInfo, logError } from "../services/logger";

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
        `Transição ignorada: ${task.name} | ${linteCode} está em "${task.currentStatus}", esperado "${mapping.requiredCurrentStatus}"`,
        { linteCode, taskId: task.id }
      );
      return;
    }
  }

  await updateTaskStatus(task.id, mapping.targetStatus);
  await logInfo("linte→clickup", `${task.name} | ${linteCode} atualizada para "${mapping.targetStatus}"`, { linteCode, taskId: task.id });

  if (linteStatusLabel === "Sob Análise do Jurídico") {
    await extractPaymentInfo(linteCode, task.id);
  }
}

async function extractPaymentInfo(linteCode: string, taskId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30000));

  try {
    const messages = await getRequisitionMessages(linteCode);
    const pattern = /Pagamento programado (\d{2}\/\d{2})(?:\/\d{2,4})?\s*\(([^)]+)\)/i;
    const match = messages.find((m) => pattern.test(m.text));

    if (!match) {
      await logInfo("linte→clickup", "Comentário de pagamento não encontrado na requisição", { linteCode, taskId });
      return;
    }

    const parsed = pattern.exec(match.text)!;
    const [day, month] = parsed[1].split("/").map(Number);

    const now = new Date();
    let year = now.getFullYear();
    if (new Date(year, month - 1, day) < now) year++;
    const timestampMs = new Date(year, month - 1, day).getTime();

    await setTaskDateField(taskId, "Previsão de pagamento", timestampMs);
    await addTaskComment(taskId, match.text);
    await logInfo("linte→clickup", `Previsão de pagamento definida para ${day}/${month}/${year}`, { linteCode, taskId });
  } catch (err) {
    await logError("linte→clickup", `Erro ao extrair info de pagamento: ${err}`, { linteCode, taskId });
  }
}
