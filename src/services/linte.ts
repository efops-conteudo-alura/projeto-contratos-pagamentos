import fetch from "node-fetch";

const ENDPOINT = "https://api.linte.com/graphql";
const API_KEY = process.env.LINTE_API_KEY!;

const headers = {
  "Content-Type": "application/json",
  key: API_KEY,
};

async function gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linte API HTTP ${res.status}`);
  }
  const data = await res.json() as { data: unknown; errors?: { message: string }[] };
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join(", "));
  }
  return data.data;
}

export async function getRequisitionMessages(requisitionId: string): Promise<{ text: string }[]> {
  const data = await gql(
    `query GetMessages($requisitionId: ID!) {
      requisition(id: $requisitionId) {
        messages {
          text
          createdAt
        }
      }
    }`,
    { requisitionId }
  ) as { requisition: { messages: { text: string; createdAt: string }[] } };

  const messages = data?.requisition?.messages ?? [];
  return [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function sendMessage(requisitionId: string, messageText: string): Promise<void> {
  await gql(
    `mutation SendMessage($requisitionId: ID!, $messageText: String!) {
      sendRequisitionMessage(requisitionId: $requisitionId, messageText: $messageText) {
        id
      }
    }`,
    { requisitionId, messageText }
  );
}
