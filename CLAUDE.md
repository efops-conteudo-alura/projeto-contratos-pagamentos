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
2. Extrai `instanceId` de `body.instanceId` (ou `body.payload.instanceId`)
3. Busca tarefa no ClickUp pelo "Código Linte" e grava `instanceId` no campo custom **"Linte Instance ID"** em **qualquer** webhook, mesmo de status não mapeado (usado pelo Fluxo 2 e pelos links do relatório diário)
4. Mapeia status via `statusMappingV2.ts` — se mapeado, atualiza o status da tarefa; se não, apenas o instanceId é gravado

**Mapeamentos v2:**

| Linte v2 | ClickUp | Observação |
|---|---|---|
| Em Assinatura | ENVIADO PARA ASSINATURA | |
| Enviar Nota Fiscal | CONTRATO ATIVO | |
| Finalizado | AGUARDANDO PAGAMENTO | só se estiver em LIBERADO PARA PAGAMENTO; posta lembrete (ver Fluxo 1c) |

---

### Fluxo 1c — Pagamento v2 (semiautomático)

Substitui a extração automática de data da v1 (que dependia de ler mensagens da Linte, API ainda indisponível na v2). Tudo acontece no lado ClickUp:

**Parte A — Linte "Finalizado" → ClickUp** (em `linteV2StatusUpdate.ts`):
1. Muda status para **AGUARDANDO PAGAMENTO** (apenas se a tarefa estiver em LIBERADO PARA PAGAMENTO)
2. Posta **dois comentários-lembrete** (um atribuído ao Vasco `78890939`, outro à Evelyn `72774719` — IDs em `REMINDER_ASSIGNEES`). A API do ClickUp não tem menção "@" que notifique; só atribuir o comentário gera notificação/item de ação. O texto do lembrete **não contém data** de propósito, para não auto-disparar a Parte B.

**Parte B — comentário colado → "Previsão de pagamento"** (em `clickupPaymentDate.ts`, gatilho `taskCommentPosted`):
- Quando alguém cola a mensagem de pagamento da Linte (ex.: "programado para 25/Junho"), o detector compartilhado `src/lib/paymentDate.ts` (`extractPaymentDate`, o mesmo da v1) extrai a data e preenche **"Previsão de pagamento"**.
- Só age se o comentário tiver palavra-chave de pagamento **E** uma data; senão é ignorado em silêncio.
- O webhook `taskCommentPosted` chama os dois handlers (`handleClickUpPaymentRequest` + `handleClickUpPaymentDate`) via `Promise.allSettled`.

---

### Fluxo 2 — ClickUp → Linte (pagamento)

**Trigger:** Comentário exato `"pedido de pagamento enviado"` no ClickUp

**Roteamento por prefixo do "Código Linte":** `ALU-*` → v1 · `ALN-*` → v2

**v1 — por tipo de prestador:**
- `RPA` → comentário de liberação na Linte
- `INVOICE` → comentário de geração de invoice na Linte
- `PJ` → comentário + URL do último PDF anexado na tarefa

**v2 (3 chamadas em sequência, conforme orientação do TI da Linte):**
1. Lê `instanceId` do campo custom **"Linte Instance ID"** da tarefa do ClickUp (gravado pelo Fluxo 1b). Se vazio, aborta — provavelmente o webhook v2 ainda não chegou.
2. **Query** `instance(filter: { id: instanceId })` para descobrir o `stepRegisterId` aberto (`completed: false`) cujo `step.name === "Enviar Nota Fiscal"` (`STEP_ENVIAR_NOTA_FISCAL_NOME`). O TI confirmou (2026-06-18) que se compara `stepRegister.step.name` (não `initialStatus.id`): o antigo `yNqSMByPtvGSRYr8k` era um `InstanceStatus` (estágio da pasta), enquanto `initialStatus` é o `MilestoneStatus` de conclusão do passo — por isso nunca batia.
3. Chama `instanceUpdate` preenchendo a ramificação **"Nota fiscal enviada?"** com `"Sim"` (vrId `a03ea467-3251-4d88-8697-6555d379f04d`). Se `PJ`, adiciona também a NF (vrId `6cDKfsDqr5cGAJt8c`, valor = URL pública do PDF — path deve terminar com `nome.ext`).
4. Chama `completeStep(id: stepRegisterId)` — o passo "Enviar Nota Fiscal" é marcado como concluído.

> ⚠️ **Pendência (testado em 2026-06-18, ALN-454 / PJ):** as 4 etapas acima funcionam — acha o passo por `step.name`, anexa a NF, preenche "Nota fiscal enviada?" = "Sim" e conclui o passo. PORÉM o **status da pasta NÃO avança automaticamente** para "Pagamento Liberado": ela fica em "Enviar Nota Fiscal" e o fluxo fica sem passos ativos. **Provável causa raiz:** o campo de arquivo **"Nota Fiscal"** (vrId `6cDKfsDqr5cGAJt8c`) ficou **vazio** no formulário do passo — só a ramificação "Sim" foi gravada. Numa pasta PJ resolvida manualmente (ALN-369) o campo tinha o PDF e o status avançou; na nossa API, não. Suspeita: o vrId do arquivo está errado, ou o formato do valor (URL em texto) não é aceito para anexo. Log `DIAG instanceUpdate` (commit 68cc6e1) compara enviado vs. devolvido para confirmar no próximo teste. **Aguardando o TI** confirmar vrId/formato do campo de arquivo. Workaround: mudar o status manualmente na Linte (Opções → Status → "Pagamento Liberado").
>
> 💡 **RPA/INVOICE provavelmente já funcionam:** contratos RPA e INVOICE não têm nota fiscal e, no fluxo manual, o passo "Enviar Nota Fiscal" avança **sem anexo**. Ou seja, o campo de arquivo "Nota Fiscal" parece ser requisito **só para PJ**. Como a v2 só concluiu passo via API a partir de 2026-06-18 (e só foi testada com PJ), vale testar um RPA/INVOICE pelo ClickUp: se avançar, o Fluxo 2 v2 já está OK para esses 2 tipos e resta só o anexo do PJ.
>
> A ramificação **precisa** ir preenchida antes do `completeStep` mesmo para RPA/INVOICE: algumas automações de workflow da Linte decidem o caminho seguinte pelos valores das variáveis.

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
LINTE_V2_TOKEN=        # configurado na Vercel
# (LINTE_V2_CATEGORY_ID não é mais necessária — instanceId vem direto do webhook)

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

**Status (2026-05-07):** v1 e v2 rodando em paralelo. v2 reescrita conforme orientação do TI: usa `instanceId` do webhook + query `stepRegister` + `completeStep`.

### Pendências com TI

- [x] Webhook `WORKFLOW_EVENT` cadastrado em `https://projeto-contratos-pagamentos.vercel.app/api/webhooks/linte-v2` (confirmado pelo TI em 2026-05-13)
- [x] `vrId` da ramificação **"Nota fiscal enviada?"** = `a03ea467-3251-4d88-8697-6555d379f04d`, valor literal `"Sim"` (recebido em 2026-05-13, já no código)
- [x] Token da API v2 confirmado como ativo (recebido em 2026-05-13)
- [x] Vasco: campo de texto **"Linte Instance ID"** criado na lista do ClickUp (em 2026-05-13)
- [x] Vasco: cadastrar `LINTE_V2_TOKEN` na Vercel (token já recebido e confirmado pelo TI)
- [ ] Teste end-to-end: validar o Fluxo 2 v2 na pasta **ALN-454** (`instanceId 7tWeormqPHirNJAmL`), que está em "Enviar Nota Fiscal". A correção do `step.name` já foi aplicada (2026-06-18); falta disparar `"pedido de pagamento enviado"` no ClickUp e confirmar que o passo é concluído e a pasta avança para "Pagamento Liberado"

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
| v2: tarefa sem "Linte Instance ID" | Campo custom não criado, ou webhook 1b ainda não chegou para essa pasta | Log: "Tarefa sem 'Linte Instance ID'" — criar campo no ClickUp e/ou aguardar webhook |
| v2: stepRegister aberto não encontrado | Status atual da pasta não é "Enviar Nota Fiscal", ou o nome do passo mudou | Ver o DIAG no `automation_log` (lista os `stepNome` retornados); se o nome do passo mudou, atualizar `STEP_ENVIAR_NOTA_FISCAL_NOME` em `linte-v2.ts` |
| v2: NF não aparece na Linte — PJ | URL do ClickUp não pública ou sem `.pdf` no path | Verificar se URL do anexo é acessível sem autenticação |
