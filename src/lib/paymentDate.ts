// Detecção da data de pagamento a partir do texto de uma mensagem/comentário.
// Compartilhado entre o Fluxo 1 v1 (mensagens da Linte) e o fluxo de comentário do ClickUp na v2.
// Critério: o texto precisa ter uma palavra-chave de pagamento E uma data parseável.

export function stripHtml(html: string): string {
  return html
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
}

// Critério flexível: cobre as variações reais das mensagens do DP.
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

function parseDateParts(text: string): { day: number; month: number; year: number | null } | null {
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

export interface PaymentDate {
  day: number;
  month: number;
  year: number;
  timestampMs: number;
}

// Retorna a data de pagamento se o texto tiver palavra-chave de pagamento E uma data; senão null.
// Quando o ano não vem no texto, assume o ano corrente — ou o próximo, se a data já passou.
export function extractPaymentDate(rawText: string): PaymentDate | null {
  const text = stripHtml(rawText);
  if (!hasPaymentKeyword.test(text)) return null;

  const parts = parseDateParts(text);
  if (!parts) return null;

  const { day, month } = parts;
  const providedYear = parts.year;

  const now = new Date();
  let year: number;
  if (providedYear) {
    year = providedYear < 100 ? 2000 + providedYear : providedYear;
  } else {
    year = now.getFullYear();
    if (new Date(year, month - 1, day) < now) year++;
  }
  const timestampMs = Date.UTC(year, month - 1, day, 12, 0, 0);

  return { day, month, year, timestampMs };
}
