export interface StatusMappingEntry {
  targetStatus: string;
  requiredCurrentStatus?: string;
}

export const LINTE_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "DP | Aguardando Assinatura": {
    targetStatus: "ENVIADO PARA ASSINATURA",
    requiredCurrentStatus: "EM ANÁLISE",
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
