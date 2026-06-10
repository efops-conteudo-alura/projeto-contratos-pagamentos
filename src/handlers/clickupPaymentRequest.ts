import { getTask, getDropdownValue, type ClickUpTask } from "../services/clickup";
import { sendMessage } from "../services/linte";
import {
  findOpenStepRegisterId,
  updateInstanceVariables,
  completeStep,
  NF_VAR_REGISTER_ID,
  NF_ENVIADA_VAR_REGISTER_ID,
  STATUS_ENVIAR_NOTA_FISCAL_ID,
} from "../services/linte-v2";
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

  if (linteCode.startsWith("ALN-")) {
    await handlePaymentV2(task, linteCode, tipo);
    return;
  }

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
    // ClickUp retorna anexos do mais recente para o mais antigo.
    // Se date_created estiver disponível, reforça a ordem decrescente; caso contrário, mantém a ordem da API.
    const pdfAttachments = attachments
      .filter((a) => a.title.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => Number(b.date_created ?? 0) - Number(a.date_created ?? 0));
    const lastAttachment = pdfAttachments[0];
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

async function handlePaymentV2(task: ClickUpTask, linteCode: string, tipo: string): Promise<void> {
  const instanceIdField = task.custom_fields.find((f) => f.name === "Linte Instance ID");
  const instanceId = typeof instanceIdField?.value === "string" ? instanceIdField.value.trim() : "";
  if (!instanceId) {
    await logError("clickup→linte-v2", `Tarefa sem "Linte Instance ID" — webhook v2 anterior não chegou ou campo não foi gravado`, {
      linteCode,
      taskId: task.id,
      taskName: task.name,
    });
    return;
  }

  // 1) Descobre o stepRegister aberto cujo initialStatus bate com "Enviar Nota Fiscal".
  const stepRegisterId = await findOpenStepRegisterId(instanceId, STATUS_ENVIAR_NOTA_FISCAL_ID);
  if (!stepRegisterId) {
    await logError("clickup→linte-v2", `stepRegister aberto não encontrado para instanceId=${instanceId} — verifique se o status atual é "Enviar Nota Fiscal"`, {
      linteCode,
      taskId: task.id,
      taskName: task.name,
      instanceId,
    });
    return;
  }

  // 2) Preenche variáveis da pasta antes de concluir o passo. O TI da Linte reforçou que algumas
  // automações de workflow decidem o caminho seguinte pelos valores preenchidos — então a
  // ramificação "Nota fiscal enviada?" precisa ir como "Sim" sempre, e para PJ anexamos a NF junto.
  const variables: { id: string; value: string }[] = [
    { id: NF_ENVIADA_VAR_REGISTER_ID, value: "Sim" },
  ];
  if (tipo === "PJ") {
    const attachments = task.attachments ?? [];
    const pdfAttachments = attachments
      .filter((a) => a.title.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => Number(b.date_created ?? 0) - Number(a.date_created ?? 0));
    const lastPdf = pdfAttachments[0];
    if (lastPdf) {
      variables.push({ id: NF_VAR_REGISTER_ID, value: lastPdf.url });
    } else {
      await logError("clickup→linte-v2", `PJ: sem PDF nos anexos da tarefa — abortando para evitar concluir o passo sem NF`, {
        linteCode,
        taskId: task.id,
        taskName: task.name,
        instanceId,
      });
      return;
    }
  }

  await updateInstanceVariables(instanceId, variables);

  // 3) Conclui o passo na Linte v2 — o status da pasta avança automaticamente.
  await completeStep(stepRegisterId);

  await logInfo("clickup→linte-v2", `Passo concluído na Linte v2 (${tipo}) — instanceId=${instanceId}`, {
    linteCode,
    taskId: task.id,
    taskName: task.name,
    instanceId,
  });
}
