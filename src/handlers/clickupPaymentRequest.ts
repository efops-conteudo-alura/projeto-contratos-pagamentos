import { getTask, getDropdownValue } from "../services/clickup";
import { sendMessage } from "../services/linte";
import { logInfo, logError } from "../services/logger";

interface ClickUpCommentPayload {
  task_id: string;
  history_items?: {
    comment?: {
      text_content: string;
    };
  }[];
}

const TRIGGER_TEXT = "pedido de pagamento enviado";

export async function handleClickUpPaymentRequest(payload: ClickUpCommentPayload): Promise<void> {
  const commentText = payload.history_items?.[0]?.comment?.text_content?.trim() ?? "";
  if (commentText.toLowerCase() !== TRIGGER_TEXT) return;

  const task = await getTask(payload.task_id);
  if (!task) {
    await logError("clickup→linte", `Tarefa ${payload.task_id} não encontrada`, { taskId: payload.task_id });
    return;
  }

  const linteCodeField = task.custom_fields.find((f) => f.name === "Código Linte");
  const linteCode = typeof linteCodeField?.value === "string" ? linteCodeField.value : null;
  if (!linteCode) {
    await logError("clickup→linte", `Tarefa ${task.id} sem campo "Código Linte"`, { taskId: task.id });
    return;
  }

  const tipoPrestadorField = task.custom_fields.find((f) => f.name === "Tipo de prestador");
  const tipoPrestador = tipoPrestadorField ? getDropdownValue(tipoPrestadorField) : null;
  if (!tipoPrestador) {
    await logError("clickup→linte", `Sem "Tipo de prestador" reconhecido — abortando`, { linteCode, taskId: task.id, taskName: task.name });
    return;
  }
  const tipo = tipoPrestador.toUpperCase();
  let messageText: string;

  if (tipo === "RPA") {
    messageText = "Olá! Podem liberar o pagamento. Obrigado!";
  } else if (tipo.includes("INVOICE")) {
    messageText = "Olá! Podem gerar o INVOICE. Obrigado!";
  } else if (tipo === "PJ") {
    messageText = "Olá! Segue NF. Podem liberar o pagamento. Obrigado!";
    const attachments = task.attachments ?? [];
    const attachmentsSummary = attachments.map((a) => `${a.title} (${a.url})`).join(" | ") || "nenhum";
    await logInfo("clickup→linte", `Anexos encontrados na tarefa PJ (${attachments.length}): ${attachmentsSummary}`, { linteCode, taskId: task.id, taskName: task.name });
    const pdfAttachments = attachments.filter((a) => a.title.toLowerCase().endsWith(".pdf"));
    const lastAttachment = pdfAttachments[pdfAttachments.length - 1];
    if (lastAttachment) {
      messageText += `\nNF: ${lastAttachment.url}`;
    } else if (attachments.length > 0) {
      await logError("clickup→linte", `PJ sem anexo PDF — enviando mensagem sem URL`, { linteCode, taskId: task.id, taskName: task.name });
    } else {
      await logError("clickup→linte", `PJ sem anexo — enviando mensagem sem URL`, { linteCode, taskId: task.id, taskName: task.name });
    }
  } else {
    await logError("clickup→linte", `Tipo de prestador não mapeado: "${tipoPrestador}" — abortando`, { linteCode, taskId: task.id, taskName: task.name });
    return;
  }

  await sendMessage(linteCode, messageText);
  await logInfo("clickup→linte", `Pedido de pagamento enviado (${tipoPrestador})`, { linteCode, taskId: task.id, taskName: task.name });
}
