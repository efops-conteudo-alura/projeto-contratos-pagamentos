# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
# Build TypeScript
npx tsc

# Desenvolvimento local com Vercel (se CLI instalado)
npx vercel dev
```

Não há scripts de teste ou lint configurados.

## Arquitetura

Automação entre **Linte** (sistema de gestão de contratos) e **ClickUp** (gerenciamento de tarefas). Implementado como serverless functions na Vercel.

### Dois fluxos principais

**Fluxo 1 — Linte → ClickUp (sync de status)**
- Webhook da Linte chega em `api/webhooks/linte.ts`
- Evento: `REQUISITION_STATUS_WAS_UPDATED_WEBHOOK`
- `src/handlers/linteStatusUpdate.ts` aplica mapeamento de `src/config/statusMapping.ts`
- Busca tarefa no ClickUp pelo campo customizado "Código Linte" (ex: "ALU-HSCAMS")
- Atualiza status da tarefa no ClickUp

**Fluxo 2 — ClickUp → Linte (pedido de pagamento)**
- Webhook do ClickUp chega em `api/webhooks/clickup.ts`
- Evento: `taskCommentPosted` com texto exato "pedido de pagamento enviado"
- `src/handlers/clickupPaymentRequest.ts` lê campo "Tipo de prestador" da tarefa
- RPA/INVOICE: envia comentário simples na demanda Linte
- PJ: busca último anexo da tarefa (a NF) e envia comentário com URL na Linte

### Serviços

- `src/services/linte.ts` — cliente GraphQL (`https://api.linte.com/graphql`, auth: header `key`)
- `src/services/clickup.ts` — cliente REST (`https://api.clickup.com/api/v2`, auth: header `Authorization`)

### Variáveis de ambiente

```
LINTE_API_KEY=
CLICKUP_API_TOKEN=
CLICKUP_LIST_ID=
```

### Mapeamento de status (Linte → ClickUp)

| Linte | ClickUp |
|---|---|
| DP \| Em Aberto | EM ANÁLISE |
| DP \| Aguardando Assinatura | ENVIADO PARA ASSINATURA |
| DP \| Ativo | CONTRATO ATIVO |
| DP \| Liberado PGTO | AGUARDANDO PAGAMENTO |
| demais | ignorar (logar) |
