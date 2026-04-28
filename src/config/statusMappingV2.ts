import type { StatusMappingEntry } from "./statusMapping";

export const LINTE_V2_TO_CLICKUP: Record<string, StatusMappingEntry> = {
  "Em Assinatura":      { targetStatus: "ENVIADO PARA ASSINATURA" },
  "Enviar Nota Fiscal": { targetStatus: "CONTRATO ATIVO" },
};
