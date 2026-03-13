import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleClickUpPaymentRequest } from "../../src/handlers/clickupPaymentRequest";
import { handleClickUpFinalized } from "../../src/handlers/clickupFinalized";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  console.log("[clickup webhook]", { event: payload?.event, task_id: payload?.task_id });

  if (payload?.event === "taskCommentPosted") {
    try {
      await handleClickUpPaymentRequest(payload);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[clickup webhook] erro:", err);
      return res.status(200).json({ ok: false, error: String(err) });
    }
  }

  if (payload?.event === "taskStatusUpdated") {
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
