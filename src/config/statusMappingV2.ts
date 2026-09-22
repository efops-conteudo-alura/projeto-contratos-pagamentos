import type { StatusMappingEntry } from "./statusMapping";

export const LINTE_V2_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "Em análise":      { targetStatus: "EM ANÁLISE" },
  "Aprovado para Assinatura":  { targetStatus: "ENVIADO PARA ASSINATURA" },
  "Em Assinatura":             { targetStatus: "ENVIADO PARA ASSINATURA" },
  "Enviar Nota Fiscal":        { targetStatus: "CONTRATO ATIVO" },
  "Pagamento Liberado":        { targetStatus: "LIBERADO PARA PAGAMENTO" },
  // ⚠️ FLUXO 1c DESLIGADO (2026-08-20, a pedido do Vasco): "Finalizado" não move mais o card.
  // Para religar, descomentar a linha abaixo (e FLUXO1C_ATIVO = true nos handlers).
  // "Finalizado":              { targetStatus: "AGUARDANDO PAGAMENTO", requiredCurrentStatus: "LIBERADO PARA PAGAMENTO", postReminder: true },
};
