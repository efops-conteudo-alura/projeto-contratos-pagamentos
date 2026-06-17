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

// vrId da ramificação "Nota fiscal enviada?" — algumas automações do workflow usam esse valor
// para decidir o caminho seguinte, então precisa ir preenchido junto com a NF antes do completeStep.
export const NF_ENVIADA_VAR_REGISTER_ID = "a03ea467-3251-4d88-8697-6555d379f04d";

// ID do status "Enviar Nota Fiscal" no fluxo Linte v2 (fornecido pelo TI: yNqSMByPtvGSRYr8k).
// Usado para localizar o stepRegister aberto que precisa ser concluído quando o pagamento é solicitado via ClickUp.
export const STATUS_ENVIAR_NOTA_FISCAL_ID = "yNqSMByPtvGSRYr8k";

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
  const allSteps = flowRegisters.flatMap((fr) => fr.stepsRegisters);

  // Log de diagnóstico: mostra exatamente o que a Linte devolveu para esta pasta.
  // Se a lista vier vazia, a pasta não foi lida (permissão/escopo do token);
  // se vier preenchida mas sem o statusId procurado, o ID do status mudou.
  console.log("[linte-v2] diagnóstico stepRegister", {
    instanceId,
    statusIdProcurado: statusId,
    instanceEncontrada: data?.instance != null,
    passos: allSteps.map((sr) => ({
      id: sr.id,
      completed: sr.completed,
      initialStatusId: sr.initialStatus?.id ?? null,
      initialStatusNome: sr.initialStatus?.name ?? null,
    })),
  });

  const openStep = allSteps.find((sr) => !sr.completed && sr.initialStatus?.id === statusId);
  return openStep?.id ?? null;
}

// Atualiza variáveis da pasta — usado para preencher a ramificação "Nota fiscal enviada?" e anexar a NF (PJ).
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
