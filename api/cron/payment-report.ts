import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../src/lib/db";

interface PaymentRow {
  id: number;
  task_id: string;
  linte_code: string | null;
  instructor_name: string | null;
}

async function sendTeamsAlert(url: string, message: string): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `⚠️ Relatório de pagamentos falhou: ${message}` }),
    });
  } catch {
    console.error("[payment-report] Falha ao enviar alerta de erro para o Teams");
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
    console.error("[payment-report] TEAMS_WEBHOOK_URL não configurada");
    return res.status(200).json({ ok: false, error: "TEAMS_WEBHOOK_URL não configurada" });
  }

  let rows: PaymentRow[];
  try {
    const result = await sql`
      SELECT id, task_id, linte_code, instructor_name
      FROM payment_queue
      WHERE sent = FALSE
      ORDER BY created_at ASC
    `;
    rows = result as PaymentRow[];
  } catch (err) {
    console.error("[payment-report] Erro ao consultar banco:", err);
    await sendTeamsAlert(teamsWebhookUrl, "Erro ao consultar banco");
    return res.status(200).json({ ok: false, error: "Erro ao consultar banco" });
  }

  if (rows.length === 0) {
    console.log("[payment-report] Nenhum contrato pendente na fila");
    return res.status(200).json({ ok: true, sent: 0 });
  }

  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const contractLines = rows.map((r) => ({
    type: "TextBlock",
    text: `📄 Instrutor(a): ${r.instructor_name ?? "—"} | Código: ${r.linte_code ?? "—"}`,
    wrap: true,
    size: "Small",
  }));

  const card = {
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
              text: `✅ Contratos finalizados — ${today}`,
              weight: "Bolder",
              size: "Medium",
            },
            ...contractLines,
          ],
        },
      },
    ],
  };

  try {
    const teamsRes = await fetch(teamsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!teamsRes.ok) {
      const body = await teamsRes.text();
      console.error(`[payment-report] Teams retornou ${teamsRes.status}: ${body}`);
      await sendTeamsAlert(teamsWebhookUrl, `Teams retornou HTTP ${teamsRes.status}`);
      return res.status(200).json({ ok: false, error: `Teams HTTP ${teamsRes.status}` });
    }
  } catch (err) {
    console.error("[payment-report] Erro ao enviar para o Teams:", err);
    await sendTeamsAlert(teamsWebhookUrl, "Erro de conexão ao enviar o relatório");
    return res.status(200).json({ ok: false, error: "Erro ao enviar para o Teams" });
  }

  const ids = rows.map((r) => r.id);
  try {
    await sql`UPDATE payment_queue SET sent = TRUE WHERE id = ANY(${ids})`;
  } catch (err) {
    console.error("[payment-report] Erro ao marcar registros como enviados:", err);
  }

  console.log(`[payment-report] Relatório enviado — ${rows.length} contrato(s)`);
  return res.status(200).json({ ok: true, sent: rows.length });
}
