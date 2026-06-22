export interface StatusMappingEntry {
  targetStatus: string;
  requiredCurrentStatus?: string | string[];
  // Quando true, além de mudar o status, posta o comentário-lembrete de pagamento na tarefa
  // (usado no Fluxo 1b v2: "Finalizado" → AGUARDANDO PAGAMENTO).
  postReminder?: boolean;
}

// Ordem canônica do funil no ClickUp (espelha o orderindex da lista). Serve de guardrail
// contra retrocesso: webhooks da Linte podem chegar atrasados ou fora de ordem e tentar
// mover a tarefa para um status anterior. Comparamos a posição atual com a do alvo e só
// deixamos avançar. Mantida em MAIÚSCULAS para casar com task.currentStatus.toUpperCase().
export const CLICKUP_STATUS_ORDER = [
  "BACKLOG",
  "EM ANÁLISE",
  "ENVIADO PARA ASSINATURA",
  "CONTRATO ATIVO",
  "LIBERADO PARA PAGAMENTO",
  "AGUARDANDO PAGAMENTO",
  "FINALIZADO",
  "FECHADO",
];

// Posição do status no funil. Retorna -1 se for um status desconhecido (fora do funil).
export function statusRank(status: string): number {
  return CLICKUP_STATUS_ORDER.indexOf(status.toUpperCase());
}

export const LINTE_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "DP | Aguardando Assinatura": {
    targetStatus: "ENVIADO PARA ASSINATURA",
    requiredCurrentStatus: ["BACKLOG", "EM ANÁLISE"],
  },
  "DP | Ativo": {
    targetStatus: "CONTRATO ATIVO",
    requiredCurrentStatus: "ENVIADO PARA ASSINATURA",
  },
  "Sob Análise do Jurídico": {
    targetStatus: "AGUARDANDO PAGAMENTO",
    requiredCurrentStatus: "LIBERADO PARA PAGAMENTO",
  },
};
