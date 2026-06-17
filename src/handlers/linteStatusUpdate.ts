import { LINTE_TO_CLICKUP } from "../config/statusMapping";
import { findTaskByLinteCode, updateTaskStatus, setTaskDateField, addTaskComment } from "../services/clickup";
import { getRequisitionMessages } from "../services/linte";
import { extractPaymentDate, stripHtml } from "../lib/paymentDate";
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
    const allowed = Array.isArray(mapping.requiredCurrentStatus)
      ? mapping.requiredCurrentStatus.map((s) => s.toUpperCase())
      : [mapping.requiredCurrentStatus.toUpperCase()];
    if (!allowed.includes(currentNormalized)) {
      const expectedLabel = Array.isArray(mapping.requiredCurrentStatus)
        ? mapping.requiredCurrentStatus.join(" ou ")
        : mapping.requiredCurrentStatus;
      await logInfo(
        "linte→clickup",
        `Transição ignorada: em "${task.currentStatus}", esperado "${expectedLabel}"`,
        { linteCode, taskId: task.id, taskName: task.name }
      );
      return;
    }
  }

  await updateTaskStatus(task.id, mapping.targetStatus);
  await logInfo("linte→clickup", `Atualizada para "${mapping.targetStatus}"`, { linteCode, taskId: task.id, taskName: task.name });

  if (linteStatusLabel === "Sob Análise do Jurídico") {
    await extractPaymentInfo(linteCode, task.id, task.name);
  }
}

const RETRY_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 10000;

async function extractPaymentInfo(linteCode: string, taskId: string, taskName: string): Promise<void> {
  try {
    let match: { content: string } | undefined;
    let messages: { content: string }[] = [];

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      messages = await getRequisitionMessages(linteCode);
      match = messages.find((m) => extractPaymentDate(m.content) !== null);

      if (match) break;

      if (attempt < RETRY_ATTEMPTS) {
        await logInfo("linte→clickup", `Mensagem de pagamento não encontrada (tentativa ${attempt}/${RETRY_ATTEMPTS}), aguardando ${RETRY_INTERVAL_MS / 1000}s`, { linteCode, taskId, taskName });
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      }
    }

    if (!match) {
      const foundTexts = messages.length > 0
        ? messages.map((m) => `"${stripHtml(m.content)}"`).join(" | ")
        : "nenhuma mensagem encontrada";
      await logInfo("linte→clickup", `Comentário de pagamento não encontrado após ${RETRY_ATTEMPTS} tentativas. Textos do DP: ${foundTexts}`, { linteCode, taskId, taskName });
      return;
    }

    const plainText = stripHtml(match.content);
    const parsed = extractPaymentDate(match.content)!;

    await setTaskDateField(taskId, "Previsão de pagamento", parsed.timestampMs);
    await addTaskComment(taskId, plainText);
    await logInfo("linte→clickup", `Previsão de pagamento definida para ${parsed.day}/${parsed.month}/${parsed.year}`, { linteCode, taskId, taskName });
  } catch (err) {
    await logError("linte→clickup", `Erro ao extrair info de pagamento: ${err}`, { linteCode, taskId, taskName });
  }
}
