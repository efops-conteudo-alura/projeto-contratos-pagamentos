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
  const data = await res.json() as { data: unknown; errors?: { message: string }[] };
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join(", "));
  }
  return data.data;
}

export async function sendMessage(requisitionId: string, messageText: string): Promise<void> {
  await gql(
    `mutation SendMessage($requisitionId: ID!, $messageText: String!) {
      sendRequisitionMessage(requisitionId: $requisitionId, messageText: $messageText)
    }`,
    { requisitionId, messageText }
  );
}

export async function sendMessageWithFile(input: {
  requisitionId: string;
  messageText: string;
  fileUrl: string;
  fileName: string;
}): Promise<void> {
  // sendRequisitionMessageWithFiles espera um input — ajustar campos conforme schema real
  await gql(
    `mutation SendMessageWithFiles($input: SendRequisitionMessageWithFilesInput!) {
      sendRequisitionMessageWithFiles(input: $input)
    }`,
    { input }
  );
}
