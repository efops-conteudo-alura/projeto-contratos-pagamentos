import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../src/lib/db";

interface LogRow {
  level: "info" | "error";
  flow: string;
  linte_code: string | null;
  task_id: string | null;
  task_name: string | null;
  message: string;
  created_at: string;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function flowColor(flow: string): string {
  if (flow === "linte→clickup" || flow === "linte-v2→clickup") return "Accent";   // azul
  if (flow === "clickup→linte" || flow === "clickup→linte-v2") return "Good";     // verde
  return "Default";
}

function flowLabel(flow: string): string {
  if (flow === "linte→clickup" || flow === "linte-v2→clickup") return "Linte → ClickUp";
  if (flow === "clickup→linte" || flow === "clickup→linte-v2") return "ClickUp → Linte";
  return flow;
}

function buildLogBlocks(row: LogRow): object[] {
  const linteUrl = row.linte_code ? `https://alura.linte.com/requests/${row.linte_code}` : null;
  const clickupUrl = row.task_id ? `https://app.clickup.com/t/${row.task_id}` : null;

  const codePrefix = linteUrl
    ? `[${row.linte_code}](${linteUrl})`
    : row.linte_code ?? "";

  const line1 = codePrefix
    ? `${formatTime(row.created_at)} ${codePrefix} | ${row.message}`
    : `${formatTime(row.created_at)} ${row.message}`;

  const blocks: object[] = [
    {
      type: "TextBlock",
      text: line1,
      wrap: true,
      size: "Small",
    },
  ];

  if (row.task_name || clickupUrl) {
    const label = row.task_name ?? "Ver no ClickUp";
    const taskText = clickupUrl ? `[${label}](${clickupUrl})` : label;
    blocks.push({
      type: "TextBlock",
      text: taskText,
      wrap: true,
      size: "Small",
      spacing: "None",
      isSubtle: true,
    });
  }

  return blocks;
}

function buildAdaptiveCard(infoRows: LogRow[], errorRows: LogRow[], dateLabel: string): object {
  const linteRows = infoRows.filter((r) => r.flow === "linte→clickup" || r.flow === "linte-v2→clickup");
  const clickupRows = infoRows.filter((r) => r.flow === "clickup→linte" || r.flow === "clickup→linte-v2");

  if (linteRows.length === 0 && clickupRows.length === 0 && errorRows.length === 0) {
    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: `📋 Resumo diário — ${dateLabel}`,
                weight: "Bolder",
                size: "Medium",
              },
              {
                type: "TextBlock",
                text: "Nenhuma movimentação ontem.",
                wrap: true,
                isSubtle: true,
              },
            ],
          },
        },
      ],
    };
  }

  const body: object[] = [
    {
      type: "TextBlock",
      text: `📋 Resumo diário — ${dateLabel}`,
      weight: "Bolder",
      size: "Medium",
    },
  ];

  if (linteRows.length > 0) {
    body.push({
      type: "TextBlock",
      text: "Linte → ClickUp",
      weight: "Bolder",
      color: "Accent",
      spacing: "Medium",
    });

    for (const row of linteRows) {
      body.push(...buildLogBlocks(row));
    }
  }

  if (clickupRows.length > 0) {
    body.push({
      type: "TextBlock",
      text: "ClickUp → Linte",
      weight: "Bolder",
      color: "Good",
      spacing: "Medium",
    });

    for (const row of clickupRows) {
      body.push(...buildLogBlocks(row));
    }
  }

  if (errorRows.length > 0) {
    body.push({
      type: "TextBlock",
      text: "⚠️ Erros",
      weight: "Bolder",
      color: "Attention",
      spacing: "Medium",
    });

    for (const row of errorRows) {
      body.push(...buildLogBlocks(row));
    }
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
        },
      },
    ],
  };
}

async function sendTeamsAlert(url: string, message: string): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `⚠️ Relatório diário falhou: ${message}` }),
    });
  } catch {
    console.error("[daily-report] Falha ao enviar alerta de erro para o Teams");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expectedToken = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!teamsWebhookUrl) {
    console.error("[daily-report] TEAMS_WEBHOOK_URL não configurada");
    return res.status(200).json({ ok: false, error: "TEAMS_WEBHOOK_URL não configurada" });
  }

  // Ontem em horário de Brasília (UTC-3)
  const now = new Date();
  const brazilOffset = -3 * 60; // minutos
  const brazilNow = new Date(now.getTime() + (brazilOffset + now.getTimezoneOffset()) * 60000);
  const yesterday = new Date(brazilNow);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateLabel = yesterday.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Intervalo UTC equivalente ao dia anterior em Brasília
  const startUtc = new Date(Date.UTC(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate(),
    3, 0, 0 // 00:00 BRT = 03:00 UTC
  ));
  const endUtc = new Date(Date.UTC(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate() + 1, // dia seguinte
    3, 0, 0 // 00:00 BRT = 03:00 UTC
  ));

  let rows: LogRow[];
  try {
    const result = await sql`
      SELECT level, flow, linte_code, task_id, task_name, message, created_at
      FROM automation_log
      WHERE created_at >= ${startUtc.toISOString()}
        AND created_at < ${endUtc.toISOString()}
      ORDER BY created_at ASC
    `;
    rows = result as LogRow[];
  } catch (err) {
    console.error("[daily-report] Erro ao consultar banco:", err);
    await sendTeamsAlert(teamsWebhookUrl, "Erro ao consultar banco");
    return res.status(200).json({ ok: false, error: "Erro ao consultar banco" });
  }

  const infoRows = rows.filter((r) => {
    const msg = r.message.toLowerCase();
    return r.level === "info" && !msg.includes("transição ignorada") && !msg.includes("ignorando");
  });
  const errorRows = rows.filter((r) => r.level === "error");

  const card = buildAdaptiveCard(infoRows, errorRows, dateLabel);

  try {
    const teamsRes = await fetch(teamsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!teamsRes.ok) {
      const body = await teamsRes.text();
      console.error(`[daily-report] Teams retornou ${teamsRes.status}: ${body}`);
      await sendTeamsAlert(teamsWebhookUrl, `Teams retornou HTTP ${teamsRes.status}`);
      return res.status(200).json({ ok: false, error: `Teams HTTP ${teamsRes.status}` });
    }
  } catch (err) {
    console.error("[daily-report] Erro ao enviar para o Teams:", err);
    await sendTeamsAlert(teamsWebhookUrl, "Erro de conexão ao enviar o relatório");
    return res.status(200).json({ ok: false, error: "Erro ao enviar para o Teams" });
  }

  console.log(`[daily-report] Relatório enviado — ${infoRows.length} info, ${errorRows.length} error`);
  return res.status(200).json({ ok: true, info: infoRows.length, error: errorRows.length });
}
