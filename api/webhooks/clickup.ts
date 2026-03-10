import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleClickUpPaymentRequest } from "../../src/handlers/clickupPaymentRequest";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  console.log("[clickup webhook]", JSON.stringify(payload));

  if (payload?.event !== "taskCommentPosted") {
    return res.status(200).json({ ignored: true });
  }

  try {
    await handleClickUpPaymentRequest(payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[clickup webhook] erro:", err);
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
