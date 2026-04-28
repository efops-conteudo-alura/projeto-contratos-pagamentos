import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleLinteV2StatusUpdate } from "../../src/handlers/linteV2StatusUpdate";

interface LinteV2Variable {
  label: string;
  type: string;
  value: string;
}

interface LinteV2WebhookPayload {
  type: string;
  instanceId: string;
  payload: {
    instanceId: string;
    variables: Record<string, LinteV2Variable>;
    status: {
      id: string;
      name: string;
    };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body as LinteV2WebhookPayload;
  console.log("[linte-v2 webhook]", { type: body?.type, instanceId: body?.instanceId });

  if (body?.type !== "WORKFLOW_EVENT") {
    return res.status(200).json({ ignored: true });
  }

  const variables = body.payload?.variables ?? {};
  const linteCodeEntry = Object.values(variables).find((v) => v.label === "ID Linte");
  const linteCode = linteCodeEntry?.value ?? null;
  const statusName = body.payload?.status?.name ?? null;

  if (!linteCode) {
    console.log("[linte-v2 webhook] Variável 'ID Linte' não encontrada no payload — ignorando");
    return res.status(200).json({ ignored: true, reason: "no linteCode" });
  }

  try {
    await handleLinteV2StatusUpdate({ linteCode, statusName: statusName ?? "" });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[linte-v2 webhook] erro:", err);
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
