import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleLinteStatusUpdate } from "../../src/handlers/linteStatusUpdate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  console.log("[linte webhook]", JSON.stringify(payload));

  if (payload?.eventType !== "REQUISITION_STATUS_WAS_UPDATED_WEBHOOK") {
    return res.status(200).json({ ignored: true });
  }

  try {
    await handleLinteStatusUpdate(payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[linte webhook] erro:", err);
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
