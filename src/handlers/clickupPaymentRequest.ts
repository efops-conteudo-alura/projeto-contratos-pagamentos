import { getTask, getDropdownValue } from "../services/clickup";
import { sendMessage } from "../services/linte";

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
  const tipoPrestador = tipoPrestadorField ? getDropdownValue(tipoPrestadorField) : null;
  if (!tipoPrestador) {
    console.error(`[clickup] Tarefa ${task.id} sem "Tipo de prestador" reconhecido — abortando`);
    return;
  }
  console.log(`[clickup] tipoPrestador resolvido: ${tipoPrestador}`);

  let messageText = "Olá! Segue nf. Podem liberar o pagamento. Obrigada!";

  if (tipoPrestador?.toUpperCase() === "PJ") {
    const attachments = task.attachments ?? [];
    const lastAttachment = attachments[attachments.length - 1];
    if (lastAttachment) {
      messageText += `\nNF: ${lastAttachment.url}`;
    } else {
      console.error(`[clickup] Tarefa PJ ${task.id} sem anexo — enviando mensagem sem URL`);
    }
  }

  await sendMessage(linteCode, messageText);
  console.log(`[clickup] Mensagem enviada para demanda Linte ${linteCode}`);
}
