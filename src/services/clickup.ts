import fetch from "node-fetch";

const BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN!;
const LIST_ID = process.env.CLICKUP_LIST_ID!;

const headers = {
  Authorization: TOKEN,
  "Content-Type": "application/json",
};

export async function findTaskByLinteCode(linteCode: string): Promise<{ id: string } | null> {
  const url = `${BASE}/list/${LIST_ID}/task?custom_fields=[{"field_id":"CODIGO_LINTE","operator":"=","value":"${encodeURIComponent(linteCode)}"}]`;
  const res = await fetch(url, { headers });
  const data = await res.json() as { tasks: { id: string }[] };
  return data.tasks?.[0] ?? null;
}

export async function searchTasksByCustomField(fieldName: string, value: string): Promise<{ id: string; custom_fields: { name: string; value: string }[] }[]> {
  const res = await fetch(`${BASE}/list/${LIST_ID}/task?include_closed=false`, { headers });
  const data = await res.json() as { tasks: { id: string; custom_fields: { name: string; value: string }[] }[] };
  return (data.tasks ?? []).filter((t) =>
    t.custom_fields?.some((f) => f.name === fieldName && f.value === value)
  );
}

export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status }),
  });
}

export async function getTask(taskId: string): Promise<{
  id: string;
  custom_fields: { name: string; value: string | { label: string } }[];
  attachments?: { url: string; title: string }[];
} | null> {
  const res = await fetch(`${BASE}/task/${taskId}`, { headers });
  if (!res.ok) return null;
  return res.json() as Promise<{ id: string; custom_fields: { name: string; value: string | { label: string } }[]; attachments?: { url: string; title: string }[] }>;
}

export async function getTaskAttachments(taskId: string): Promise<{ url: string; title: string }[]> {
  const res = await fetch(`${BASE}/task/${taskId}/attachment`, { headers });
  if (!res.ok) return [];
  const data = await res.json() as { attachments: { url: string; title: string }[] };
  return data.attachments ?? [];
}
