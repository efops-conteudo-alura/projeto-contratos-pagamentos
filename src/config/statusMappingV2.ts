import type { StatusMappingEntry } from "./statusMapping";

export const LINTE_V2_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "Em Assinatura":      { targetStatus: "ENVIADO PARA ASSINATURA" },
  "Enviar Nota Fiscal": { targetStatus: "CONTRATO ATIVO" },
  // ⚠️ FLUXO 1c DESLIGADO (2026-08-20, a pedido do Vasco): "Finalizado" não move mais o card.
  // Para religar, descomentar a linha abaixo (e FLUXO1C_ATIVO = true nos handlers).
  // "Finalizado":         { targetStatus: "AGUARDANDO PAGAMENTO", requiredCurrentStatus: "LIBERADO PARA PAGAMENTO", postReminder: true },
};
