import fetch from "node-fetch";

const ENDPOINT = "https://docs-api.linte.com/graphql";

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

// vrId fixo do campo de arquivo "Nota Fiscal" (fornecido pelo TI da Linte).
export const NF_VAR_REGISTER_ID = "6cDKfsDqr5cGAJt8c";

// ID do status "Enviar Nota Fiscal" no fluxo Linte v2 (fornecido pelo TI: yNqSMByPtvGSRYr8k).
// Usado para localizar o stepRegister aberto que precisa ser concluído quando o pagamento é solicitado via ClickUp.
export const STATUS_ENVIAR_NOTA_FISCAL_ID = "yNqSMByPtvGSRYr8k";

// TODO: vrId da ramificação "Nota fiscal enviada?" — pendente do TI da Linte.
// Quando chegar, preencher e ajustar updateInstanceVariables/handlePaymentV2 para enviar { id, value: "Sim" }.

interface FlowRegister {
  id: string;
  stepsRegisters: {
    id: string;
    completed: boolean;
    initialStatus?: { id: string; name: string } | null;
  }[];
}

// Descobre o id do stepRegister aberto cujo initialStatus bate com o status atual da pasta.
// É esse id que entra em completeStep(id: ...) para avançar o fluxo na Linte v2.
export async function findOpenStepRegisterId(instanceId: string, statusId: string): Promise<string | null> {
  const data = await gql(
    `query BuscarStepRegister($instanceId: String!) {
      instance(filter: { id: $instanceId }) {
        id
        flowRegisters {
          id
          stepsRegisters {
            id
            completed
            initialStatus { id name }
          }
        }
      }
    }`,
    { instanceId }
  ) as { instance: { id: string; flowRegisters: FlowRegister[] } | null };

  const flowRegisters = data?.instance?.flowRegisters ?? [];
  const openStep = flowRegisters
    .flatMap((fr) => fr.stepsRegisters)
    .find((sr) => !sr.completed && sr.initialStatus?.id === statusId);
  return openStep?.id ?? null;
}

// Atualiza variáveis da pasta — usado para anexar a NF (PJ) e, futuramente, a ramificação "Nota fiscal enviada?".
// A Linte baixa o arquivo a partir da URL pública. Requisito: path da URL deve terminar com nome.extensao.
export async function updateInstanceVariables(
  instanceId: string,
  variables: { id: string; value: string }[]
): Promise<void> {
  if (variables.length === 0) return;
  await gql(
    `mutation AtualizarVariaveis($id: String!, $input: InstanceUpdateInput!) {
      instanceUpdate(id: $id, input: $input) {
        id
        variables { id value }
      }
    }`,
    { id: instanceId, input: { variables } }
  );
}

// Conclui o passo aberto na Linte v2, fazendo o status avançar (ex.: "Enviar Nota Fiscal" → "Pagamento Liberado").
export async function completeStep(stepRegisterId: string): Promise<void> {
  await gql(
    `mutation ConcluirPasso($id: String!) {
      completeStep(id: $id) {
        id
      }
    }`,
    { id: stepRegisterId }
  );
}
