import fetch from "node-fetch";

const ENDPOINT = "https://docs-api.linte.com/graphql";
const CATEGORY_ID = process.env.LINTE_V2_CATEGORY_ID!;

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.LINTE_V2_TOKEN!}`,
  };
}

async function gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Linte v2 API HTTP ${res.status}`);
  }
  const data = await res.json() as { data: unknown; errors?: { message: string }[] };
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join(", "));
  }
  return data.data;
}

// Busca o instanceId real a partir do código legível (ex: "ALN-254" → busca identifier "254").
// Usa o filtro custom { categoryId, id } da API Linte v2.
// ⚠️ Assumimos que custom.id aceita o número do identifier — verificar em produção.
export async function findInstanceByLinteCode(linteCode: string): Promise<string | null> {
  const customId = linteCode.split("-")[1];
  if (!customId) return null;

  const data = await gql(
    `query FindInstance($categoryId: String!, $customId: String!) {
      instance(filter: { custom: { categoryId: $categoryId, id: $customId } }) {
        id
      }
    }`,
    { categoryId: CATEGORY_ID, customId }
  ) as { instance: { id: string } | null };

  return data?.instance?.id ?? null;
}

// Muda o status da instância usando o nome do status.
// ⚠️ Se a API exigir o ID em vez do nome, substituir statusName pelo ID correspondente.
export async function updateInstanceStatus(instanceId: string, statusName: string): Promise<void> {
  await gql(
    `mutation UpdateStatus($id: String!, $input: InstanceUpdateInput!) {
      instanceUpdate(id: $id, input: $input) {
        id
        status
      }
    }`,
    { id: instanceId, input: { status: statusName } }
  );
}

// vrId fixo do campo "Nota Fiscal" na categoria de contratos (fornecido pelo TI da Linte).
const NF_VAR_REGISTER_ID = "6cDKfsDqr5cGAJt8c";

// Anexa um arquivo à pasta da Linte v2 passando a URL pública do arquivo.
// A API baixa o arquivo a partir da URL — não aceita binário nem base64.
// Requisito da Linte: o path da URL deve terminar com nome.extensao (ex: .../contrato.pdf).
export async function attachFileToInstance(instanceId: string, fileUrl: string): Promise<void> {
  await gql(
    `mutation AnexarArquivo($id: String!, $input: InstanceUpdateInput!) {
      instanceUpdate(id: $id, input: $input) {
        id
        variables { id value }
      }
    }`,
    {
      id: instanceId,
      input: {
        variables: [{ id: NF_VAR_REGISTER_ID, value: fileUrl }],
      },
    }
  );
}
