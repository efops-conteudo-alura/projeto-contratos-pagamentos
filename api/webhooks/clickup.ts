import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleClickUpPaymentRequest } from "../../src/handlers/clickupPaymentRequest";
import { handleClickUpPaymentDate } from "../../src/handlers/clickupPaymentDate";
import { handleClickUpFinalized } from "../../src/handlers/clickupFinalized";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  console.log("[clickup webhook]", { event: payload?.event, task_id: payload?.task_id });

  if (payload?.event === "taskCommentPosted") {
    // Dois fluxos reagem a comentário e são mutuamente exclusivos pelo conteúdo:
    // - handleClickUpPaymentRequest: "pedido de pagamento enviado" → aciona a Linte
    // - handleClickUpPaymentDate: mensagem de pagamento com data → preenche "Previsão de pagamento"
    // allSettled garante que um erro em um não impeça o outro.
    const results = await Promise.allSettled([
      handleClickUpPaymentRequest(payload),
      handleClickUpPaymentDate(payload),
    ]);
    for (const r of results) {
      if (r.status === "rejected") console.error("[clickup webhook] handler de comentário falhou:", r.reason);
    }
    return res.status(200).json({ ok: true });
  }

  if (payload?.event === "taskStatusUpdated" || payload?.event === "taskUpdated") {
    const newStatus: string = payload?.history_items?.[0]?.after?.status ?? "";
    if (newStatus.toUpperCase() === "FINALIZADO") {
      try {
        await handleClickUpFinalized(payload.task_id);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("[clickup webhook] erro ao processar FINALIZADO:", err);
        return res.status(200).json({ ok: false, error: String(err) });
      }
    }
  }

  return res.status(200).json({ ignored: true });
}
