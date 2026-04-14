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
  const stripHtml = (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&ccedil;/gi, "ç")
      .replace(/&atilde;/gi, "ã")
      .replace(/&otilde;/gi, "õ")
      .replace(/&aacute;/gi, "á")
      .replace(/&eacute;/gi, "é")
      .replace(/&iacute;/gi, "í")
      .replace(/&oacute;/gi, "ó")
      .replace(/&uacute;/gi, "ú")
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/\s+/g, " ")
      .trim();

  // Critério flexível: cobre as variações reais das mensagens do DP
  // Palavras: pagamento, pgto, pagto, lançado/a, agendado/a, programado/a, progamado (typo), incluído/a
  const hasPaymentKeyword = /pag(?:amento|to)|pgto|lan[çc]|agendad|programad|progamad|inclui[dí]/i;

  const MONTH_NAMES: Record<string, number> = {
    janeiro: 1, jan: 1,
    fevereiro: 2, fev: 2,
    março: 3, marco: 3, mar: 3,
    abril: 4, abr: 4,
    maio: 5, mai: 5,
    junho: 6, jun: 6,
    julho: 7, jul: 7,
    agosto: 8, ago: 8,
    setembro: 9, set: 9,
    outubro: 10, out: 10,
    novembro: 11, nov: 11,
    dezembro: 12, dez: 12,
  };

  // Data numérica: dd/mm ou dd/mm/yyyy (aceita espaço ao redor da barra)
  const numericDatePattern = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\/(\d{2,4}))?/;
  // Data com nome do mês em português: "24/Abril" ou "24 de Abril"
  const namedMonthPattern = new RegExp(
    `(\\d{1,2})\\s*(?:\\/|\\s+de\\s+)\\s*(${Object.keys(MONTH_NAMES).join("|")})`,
    "i"
  );

  function parseDateFromText(text: string): { day: number; month: number; year: number | null } | null {
    const num = numericDatePattern.exec(text);
    if (num) {
      return { day: parseInt(num[1]), month: parseInt(num[2]), year: num[3] ? parseInt(num[3]) : null };
    }
    const named = namedMonthPattern.exec(text);
    if (named) {
      const monthNum = MONTH_NAMES[named[2].toLowerCase()];
      if (monthNum) return { day: parseInt(named[1]), month: monthNum, year: null };
    }
    return null;
  }

  try {
    let match: { content: string } | undefined;
    let messages: { content: string }[] = [];

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      messages = await getRequisitionMessages(linteCode);
      match = messages.find((m) => {
        const text = stripHtml(m.content);
        return hasPaymentKeyword.test(text) && parseDateFromText(text) !== null;
      });

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
    const parsed = parseDateFromText(plainText)!;
    const { day, month } = parsed;
    const providedYear = parsed.year;

    const now = new Date();
    let year: number;
    if (providedYear) {
      year = providedYear < 100 ? 2000 + providedYear : providedYear;
    } else {
      year = now.getFullYear();
      if (new Date(year, month - 1, day) < now) year++;
    }
    const timestampMs = Date.UTC(year, month - 1, day, 12, 0, 0);

    await setTaskDateField(taskId, "Previsão de pagamento", timestampMs);
    await addTaskComment(taskId, plainText);
    await logInfo("linte→clickup", `Previsão de pagamento definida para ${day}/${month}/${year}`, { linteCode, taskId, taskName });
  } catch (err) {
    await logError("linte→clickup", `Erro ao extrair info de pagamento: ${err}`, { linteCode, taskId, taskName });
  }
}
