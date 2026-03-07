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

export interface ClickUpCustomField {
  name: string;
  type: string;
  value: unknown;
  type_config?: {
    options?: { id: string; name: string; orderindex: number }[];
  };
}

export interface ClickUpTask {
  id: string;
  custom_fields: ClickUpCustomField[];
  attachments?: { url: string; title: string; id: string }[];
}

export async function getTask(taskId: string): Promise<ClickUpTask | null> {
  const res = await fetch(`${BASE}/task/${taskId}?include_subtasks=false`, { headers });
  if (!res.ok) return null;
  return res.json() as Promise<ClickUpTask>;
}

export function getDropdownValue(field: ClickUpCustomField): string | null {
  if (field.value === null || field.value === undefined) return null;
  const orderindex = typeof field.value === "number" ? field.value : Number(field.value);
  const option = field.type_config?.options?.find((o) => o.orderindex === orderindex);
  return option?.name ?? null;
}
