import { getTask, getTaskAttachments } from "../services/clickup";
import { sendMessage, sendMessageWithFile } from "../services/linte";

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
    console.error(`[clickup] Tarefa ${payload.task_id} não encontrada`);
    return;
  }

  const linteCodeField = task.custom_fields.find((f) => f.name === "Código Linte");
  const linteCode = typeof linteCodeField?.value === "string" ? linteCodeField.value : null;
  if (!linteCode) {
    console.error(`[clickup] Tarefa ${task.id} sem campo "Código Linte"`);
    return;
  }

  const tipoPrestadorField = task.custom_fields.find((f) => f.name === "Tipo de prestador");
  const tipoPrestador =
    typeof tipoPrestadorField?.value === "object" && tipoPrestadorField.value !== null
      ? (tipoPrestadorField.value as { label: string }).label
      : typeof tipoPrestadorField?.value === "string"
      ? tipoPrestadorField.value
      : null;

  const messageText = "Pedido de pagamento enviado pelo ClickUp.";

  if (tipoPrestador?.toUpperCase() === "PJ") {
    const attachments = await getTaskAttachments(task.id);
    const lastAttachment = attachments[attachments.length - 1];
    if (!lastAttachment) {
      console.error(`[clickup] Tarefa PJ ${task.id} sem anexo para enviar com o pedido`);
      return;
    }
    await sendMessageWithFile({
      requisitionId: linteCode,
      messageText,
      fileUrl: lastAttachment.url,
      fileName: lastAttachment.title,
    });
    console.log(`[clickup] Mensagem com anexo enviada para demanda Linte ${linteCode}`);
  } else {
    await sendMessage(linteCode, messageText);
    console.log(`[clickup] Mensagem enviada para demanda Linte ${linteCode}`);
  }
}
