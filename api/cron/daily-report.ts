import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../src/lib/db";

interface LogRow {
  level: "info" | "error";
  flow: string;
  linte_code: string | null;
  task_id: string | null;
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

function buildAdaptiveCard(infoRows: LogRow[], errorRows: LogRow[], dateLabel: string): object {
  const totalInfo = infoRows.length;
  const totalError = errorRows.length;

  if (totalInfo === 0 && totalError === 0) {
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
    {
      type: "FactSet",
      facts: [
        { title: "✅ Info", value: String(totalInfo) },
        { title: "❌ Erros", value: String(totalError) },
      ],
    },
  ];

  if (infoRows.length > 0) {
    body.push({
      type: "TextBlock",
      text: "Eventos processados",
      weight: "Bolder",
      spacing: "Medium",
    });

    for (const row of infoRows) {
      body.push({
        type: "TextBlock",
        text: `${formatTime(row.created_at)} — ${row.message}`,
        wrap: true,
        size: "Small",
      });
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
      body.push({
        type: "TextBlock",
        text: `${formatTime(row.created_at)} — ${row.message}`,
        wrap: true,
        size: "Small",
        color: "Attention",
      });
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
      SELECT level, flow, linte_code, task_id, message, created_at
      FROM automation_log
      WHERE created_at >= ${startUtc.toISOString()}
        AND created_at < ${endUtc.toISOString()}
      ORDER BY created_at ASC
    `;
    rows = result as LogRow[];
  } catch (err) {
    console.error("[daily-report] Erro ao consultar banco:", err);
    return res.status(200).json({ ok: false, error: "Erro ao consultar banco" });
  }

  const infoRows = rows.filter((r) => r.level === "info");
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
      return res.status(200).json({ ok: false, error: `Teams HTTP ${teamsRes.status}` });
    }
  } catch (err) {
    console.error("[daily-report] Erro ao enviar para o Teams:", err);
    return res.status(200).json({ ok: false, error: "Erro ao enviar para o Teams" });
  }

  console.log(`[daily-report] Relatório enviado — ${infoRows.length} info, ${errorRows.length} error`);
  return res.status(200).json({ ok: true, info: infoRows.length, error: errorRows.length });
}
