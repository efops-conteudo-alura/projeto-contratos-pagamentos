import type { StatusMappingEntry } from "./statusMapping";

export const LINTE_V2_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "Em análise":           { targetStatus: "em análise" },
  "Aprovado para Assinatura":  { targetStatus: "enviado para assinatura" },
  "Em Assinatura":             { targetStatus: "enviado para assinatura" },
  "Enviar Nota Fiscal":        { targetStatus: "contrato ativo" },
  "Pagamento Liberado":        { targetStatus: "liberado para pagamento" },
  // ⚠️ FLUXO 1c DESLIGADO (2026-08-20, a pedido do Vasco): "Finalizado" não move mais o card.
  // Para religar, descomentar a linha abaixo (e FLUXO1C_ATIVO = true nos handlers).
  // "Finalizado":              { targetStatus: "aguardando pagamento", requiredCurrentStatus: "liberado para pagamento", postReminder: true },
};
