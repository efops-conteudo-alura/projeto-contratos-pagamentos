import type { StatusMappingEntry } from "./statusMapping";

export const LINTE_V2_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  // Mapeamentos ativos
  "Aprovação padrão DP":  { targetStatus: "em análise" },
  "Em Assinatura":        { targetStatus: "enviado para assinatura" },
  "Enviar Nota Fiscal":   { targetStatus: "contrato ativo" },

  // Statuses recebidos mas sem ação no ClickUp por enquanto:
  // "Aprovado para Assinatura" — sem ação
  // "Documento assinado"       — sem ação (em breve vai para contrato ativo diretamente)
  // "Pagamento Liberado"       — sem ação (tratamento diferente a definir)
  // "Finalizado"               — sem ação (tratamento diferente a definir, Fluxo 1c desligado 2026-08-20)
};
