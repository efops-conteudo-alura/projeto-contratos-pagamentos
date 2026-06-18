import fetch from "node-fetch";
import { logInfo } from "./logger";

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

// Nome do passo "Enviar Nota Fiscal" no fluxo Linte v2.
// O TI confirmou (2026-06-18) que o stepRegister tem o campo step { id name }, e step.name
// corresponde ao payload.status.name do webhook. O antigo ID yNqSMByPtvGSRYr8k era um
// InstanceStatus (estágio da pasta), não casava com stepRegister.initialStatus (MilestoneStatus
// de conclusão do passo) — por isso o Fluxo 2 v2 nunca achava o passo. Agora comparamos por nome.
export const STEP_ENVIAR_NOTA_FISCAL_NOME = "Enviar Nota Fiscal";

interface FlowRegister {
  id: string;
  stepsRegisters: {
    id: string;
    completed: boolean;
    step?: { id: string; name: string } | null;
  }[];
}

// Descobre o id do stepRegister aberto (completed: false) cujo step.name bate com o nome do passo
// procurado (ex.: "Enviar Nota Fiscal"). É esse id que entra em completeStep(id: ...) para avançar o fluxo.
export async function findOpenStepRegisterId(instanceId: string, stepName: string): Promise<string | null> {
  const data = await gql(
    `query BuscarStepRegister($instanceId: String!) {
      instance(filter: { id: $instanceId }) {
        id
        flowRegisters {
          id
          stepsRegisters {
            id
            completed
            step { id name }
          }
        }
      }
    }`,
    { instanceId }
  ) as { instance: { id: string; flowRegisters: FlowRegister[] } | null };

  const flowRegisters = data?.instance?.flowRegisters ?? [];
  const allSteps = flowRegisters.flatMap((fr) => fr.stepsRegisters);

  // Diagnóstico persistido no banco (automation_log): mostra exatamente o que a Linte
  // devolveu para esta pasta. Se a lista vier vazia, a pasta não foi lida
  // (permissão/escopo do token); se vier preenchida mas sem o stepName procurado,
  // o nome do passo mudou. Gravamos via logger para conseguir ler o conteúdo cru.
  const diagnostico = {
    stepNameProcurado: stepName,
    instanceEncontrada: data?.instance != null,
    passos: allSteps.map((sr) => ({
      id: sr.id,
      completed: sr.completed,
      stepId: sr.step?.id ?? null,
      stepNome: sr.step?.name ?? null,
    })),
  };
  await logInfo("clickup→linte-v2", `DIAG stepRegister: ${JSON.stringify(diagnostico)}`, { instanceId });

  const openStep = allSteps.find((sr) => !sr.completed && sr.step?.name === stepName);
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
