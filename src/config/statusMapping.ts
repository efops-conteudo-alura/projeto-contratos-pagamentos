export interface StatusMappingEntry {
  targetStatus: string;
  requiredCurrentStatus?: string | string[];
  // Quando true, além de mudar o status, posta o comentário-lembrete de pagamento na tarefa
  // (usado no Fluxo 1b v2: "Finalizado" → AGUARDANDO PAGAMENTO).
  postReminder?: boolean;
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
