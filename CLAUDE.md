# CLAUDE.md

## Comandos

```bash
npx tsc --noEmit   # Verificar tipos
npx tsc            # Build
npx vercel dev     # Dev local (requer Vercel CLI)
```

Não há scripts de teste ou lint configurados.

## Arquitetura

Automação entre **Linte** (gestão de contratos) e **ClickUp** (tarefas). Serverless functions na Vercel.

```
api/
  webhooks/
    linte.ts            # Webhooks Linte v1
    linte-v2.ts         # Webhooks Linte v2 (WORKFLOW_EVENT)
    clickup.ts          # Webhooks ClickUp
  cron/
    daily-report.ts     # Relatório diário → Teams (08h BRT)
src/
  config/
    statusMapping.ts    # Status Linte v1 → ClickUp
    statusMappingV2.ts  # Status Linte v2 → ClickUp
  handlers/
    linteStatusUpdate.ts      linteV2StatusUpdate.ts
    clickupPaymentRequest.ts  clickupFinalized.ts
  services/
    linte.ts   linte-v2.ts   clickup.ts   logger.ts
  lib/
    db.ts
```

---

## Fluxos

### Fluxo 1 — Linte v1 → ClickUp

**Trigger:** `REQUISITION_STATUS_WAS_UPDATED_WEBHOOK` em `api/webhooks/linte.ts`

1. Mapeia status via `statusMapping.ts` — se não mapeado, ignora
2. Busca tarefa pelo campo **"Código Linte"** (`findTaskByLinteCode` — UUID do campo cacheado em memória)
3. Atualiza status
4. Se `"Sob Análise do Jurídico"`: executa `extractPaymentInfo` (3 tentativas × 10s) — extrai data de pagamento de mensagens da Linte e atualiza **"Previsão de pagamento"** + comentário no ClickUp

**Mapeamentos v1:**

| Linte v1 | ClickUp |
|---|---|
| DP \| Em Aberto | EM ANÁLISE |
| DP \| Aguardando Assinatura | ENVIADO PARA ASSINATURA |
| DP \| Ativo | CONTRATO ATIVO |
| Sob Análise do Jurídico | AGUARDANDO PAGAMENTO |

Editar apenas `src/config/statusMapping.ts` para adicionar mapeamentos.

---

### Fluxo 1b — Linte v2 → ClickUp

**Trigger:** `WORKFLOW_EVENT` em `api/webhooks/linte-v2.ts`

1. Extrai `linteCode` de `payload.payload.variables` buscando `label === "ID Linte"` (UUID: `pP3Ds4ewFwjsWryHT`; valor ex: `"ALN-254"`)
2. Mapeia status via `statusMappingV2.ts` — se não mapeado, ignora
3. Busca e atualiza tarefa no ClickUp (mesmo campo "Código Linte" do v1)

**Mapeamentos v2:**

| Linte v2 | ClickUp |
|---|---|
| Em Assinatura | ENVIADO PARA ASSINATURA |
| Enviar Nota Fiscal | CONTRATO ATIVO |

---

### Fluxo 2 — ClickUp → Linte (pagamento)

**Trigger:** Comentário exato `"pedido de pagamento enviado"` no ClickUp

**Roteamento por prefixo do "Código Linte":** `ALU-*` → v1 · `ALN-*` → v2

**v1 — por tipo de prestador:**
- `RPA` → comentário de liberação na Linte
- `INVOICE` → comentário de geração de invoice na Linte
- `PJ` → comentário + URL do último PDF anexado na tarefa

**v2:**
1. Busca `instanceId` via `findInstanceByLinteCode` (query `BuscarPorCustomId` usando o número do código — ⚠️ a confirmar em produção)
2. Muda status para `"Pagamento Liberado"` via `instanceUpdate` (⚠️ nome ou ID — a confirmar)
3. Se `PJ`: envia URL do PDF do ClickUp para Linte v2 via `instanceUpdate` com `variables: [{ id: "6cDKfsDqr5cGAJt8c", value: url }]` — a Linte baixa o arquivo. Requisito: path da URL deve terminar com `nome.ext`

---

### Fluxo 3 — Cron: relatório diário

**Trigger:** `0 11 * * *` UTC (08h BRT) · `api/cron/daily-report.ts`

Busca logs do dia anterior no Postgres e envia Adaptive Card para `TEAMS_WEBHOOK_URL`.

---

## Serviços

| Arquivo | Protocolo | Base URL | Auth |
|---|---|---|---|
| `linte.ts` | GraphQL | `https://api.linte.com/graphql` | `key: <LINTE_API_KEY>` |
| `linte-v2.ts` | GraphQL | `https://docs-api.linte.com/graphql` | `Authorization: Bearer <LINTE_V2_TOKEN>` |
| `clickup.ts` | REST | `https://api.clickup.com/api/v2` | `Authorization: <CLICKUP_API_TOKEN>` |

`logger.ts` — grava no console + tabela `automation_log` (Postgres). Silencia erros de banco.

`db.ts` — exporta `sql` (Neon) e `ensureSchema()`. Já executada em produção (2026-04-28).

---

## Variáveis de ambiente

```
# Linte v1 (manter enquanto contratos antigos existirem)
LINTE_API_KEY=

# Linte v2
LINTE_V2_TOKEN=        # ⚠️ Pendente configurar na Vercel (token já fornecido pelo TI)
LINTE_V2_CATEGORY_ID=  # ✅ c9a103edc6d45f96a1140413

# ClickUp
CLICKUP_API_TOKEN=
CLICKUP_LIST_ID=

# Infra
POSTGRES_URL=
TEAMS_WEBHOOK_URL=
CRON_SECRET=
```

> Em desenvolvimento local, usar `.env.local`. Nunca commitar.

---

## Convenções

- Webhooks sempre retornam **HTTP 200**, mesmo em erro (`{ ok: false }`). 4xx/5xx causaria retry e duplicação.
- Logs incluem contexto: `linteCode`, `taskId`, `taskName`.
- Não propagar exceções nos handlers — capturar e logar.
- TypeScript strict mode; evitar `any`.

---

## Migração Linte v2

**Status (2026-04-28):** v1 e v2 rodando em paralelo. v2 implementada, aguardando token e webhook cadastrado.

### Pendências com TI

- [ ] Configurar `LINTE_V2_TOKEN` na Vercel
- [ ] Cadastrar webhook `WORKFLOW_EVENT` → `https://projeto-contratos-pagamentos.vercel.app/api/webhooks/linte-v2`
- [ ] Confirmar se `instance(filter: { custom: { categoryId, id: "254" } })` retorna instância correta para `ALN-254`
- [ ] Confirmar se `instanceUpdate` aceita nome do status (`"Pagamento Liberado"`) ou exige o ID

### Desligar a Linte v1

Quando o TI confirmar que **nenhum contrato ativo** usa a Linte v1:

1. Remover arquivos: `api/webhooks/linte.ts`, `src/services/linte.ts`, `src/handlers/linteStatusUpdate.ts`, `src/config/statusMapping.ts`
2. Remover `LINTE_API_KEY` da Vercel
3. Renomear: `linte-v2.ts` → `linte.ts`, `linteV2StatusUpdate.ts` → `linteStatusUpdate.ts`, `statusMappingV2.ts` → `statusMapping.ts`
4. Atualizar os imports nos handlers e no webhook (`api/webhooks/linte-v2.ts` → `api/webhooks/linte.ts`)
5. Remover lógica de roteamento por prefixo `ALN-`/`ALU-` em `clickupPaymentRequest.ts`

---

## Troubleshooting

| Sintoma | Causa provável | Verificação |
|---|---|---|
| Tarefa não encontrada | "Código Linte" vazio ou formato errado | Confirmar valor exato no ClickUp |
| Status não atualiza (v1) | Status não mapeado | Log deve mostrar "ignorando" |
| Comentário não enviado — PJ v1 | Sem PDF anexado | Confirmar NF anexada antes do comentário |
| Previsão de pagamento não atualiza | Mensagem do DP não encontrada | Log exibe textos encontrados — verificar keyword + data `dd/mm` |
| v2: webhook não chega | URL errada ou webhook não cadastrado na Linte | Confirmar cadastro com TI |
| v2: status não atualiza no ClickUp | "ID Linte" ausente no payload ou status não mapeado | Log: "Variável não encontrada" ou "sem mapeamento" |
| v2: "Pagamento Liberado" não muda | `LINTE_V2_TOKEN` não configurado ou expirado | Verificar variável na Vercel |
| v2: `instanceId` não encontrado | `LINTE_V2_CATEGORY_ID` errado ou query não funciona | Confirmar com TI a query correta |
| v2: NF não aparece na Linte — PJ | URL do ClickUp não pública ou sem `.pdf` no path | Verificar se URL do anexo é acessível sem autenticação |
