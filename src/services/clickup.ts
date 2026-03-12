import fetch from "node-fetch";

const BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN!;
const LIST_ID = process.env.CLICKUP_LIST_ID!;

const headers = {
  Authorization: TOKEN,
  "Content-Type": "application/json",
};

const customFieldIdCache = new Map<string, string>();

async function getListCustomFieldId(fieldName: string): Promise<string | null> {
  if (customFieldIdCache.has(fieldName)) return customFieldIdCache.get(fieldName)!;
  const res = await fetch(`${BASE}/list/${LIST_ID}/field`, { headers });
  if (!res.ok) {
    console.error(`[clickup] Falha ao buscar campos da lista (${res.status})`);
    return null;
  }
  const data = await res.json() as { fields: { id: string; name: string }[] };
  const id = data.fields?.find((f) => f.name === fieldName)?.id ?? null;
  if (id) customFieldIdCache.set(fieldName, id);
  return id;
}

export async function findTaskByLinteCode(linteCode: string): Promise<{ id: string; currentStatus: string } | null> {
  const fieldId = await getListCustomFieldId("Código Linte");
  if (!fieldId) {
    console.error(`[clickup] Campo "Código Linte" não encontrado na lista`);
    return null;
  }
  const filter = encodeURIComponent(JSON.stringify([{ field_id: fieldId, operator: "=", value: linteCode }]));
  const res = await fetch(`${BASE}/list/${LIST_ID}/task?custom_fields=${filter}`, { headers });
  if (!res.ok) {
    console.error(`[clickup] Erro ao buscar tarefa por Código Linte (${res.status})`);
    return null;
  }
  const data = await res.json() as { tasks: { id: string; status: { status: string } }[] };
  const task = data.tasks?.[0];
  if (!task) return null;
  return { id: task.id, currentStatus: task.status?.status ?? "" };
}

export async function searchTasksByCustomField(fieldName: string, value: string): Promise<{ id: string; custom_fields: { name: string; value: string }[] }[]> {
  const allTasks: { id: string; custom_fields: { name: string; value: string }[] }[] = [];
  let page = 0;

  while (true) {
    const res = await fetch(`${BASE}/list/${LIST_ID}/task?include_closed=false&page=${page}`, { headers });
    const data = await res.json() as { tasks: { id: string; custom_fields: { name: string; value: string }[] }[] };
    const tasks = data.tasks ?? [];
    allTasks.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }

  return allTasks.filter((t) =>
    t.custom_fields?.some((f) => f.name === fieldName && f.value === value)
  );
}

export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp updateTaskStatus falhou (${res.status}): ${body}`);
  }
  console.log(`[clickup] Status da tarefa ${taskId} atualizado para "${status}"`);
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
  if (!res.ok) {
    console.error(`[clickup] Falha ao buscar tarefa ${taskId} (${res.status})`);
    return null;
  }
  return res.json() as Promise<ClickUpTask>;
}

export async function setTaskDateField(taskId: string, fieldName: string, timestampMs: number): Promise<void> {
  const fieldId = await getListCustomFieldId(fieldName);
  if (!fieldId) {
    throw new Error(`Campo "${fieldName}" não encontrado na lista`);
  }
  const res = await fetch(`${BASE}/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ value: timestampMs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp setTaskDateField falhou (${res.status}): ${body}`);
  }
}

export async function addTaskComment(taskId: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}/comment`, {
    method: "POST",
    headers,
    body: JSON.stringify({ comment_text: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp addTaskComment falhou (${res.status}): ${body}`);
  }
}

export function getDropdownValue(field: ClickUpCustomField): string | null {
  if (field.value === null || field.value === undefined) return null;
  const orderindex = typeof field.value === "number" ? field.value : Number(field.value);
  const option = field.type_config?.options?.find((o) => o.orderindex === orderindex);
  return option?.name ?? null;
}
