# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
# Build TypeScript
npx tsc

# Desenvolvimento local com Vercel (se CLI instalado)
npx vercel dev

# Verificar tipos sem emitir arquivos
npx tsc --noEmit
```

Não há scripts de teste ou lint configurados.

## Arquitetura

Automação entre **Linte** (sistema de gestão de contratos) e **ClickUp** (gerenciamento de tarefas). Implementado como serverless functions na Vercel.

```
api/
  webhooks/
    linte.ts       # Entrada: webhooks da Linte
    clickup.ts     # Entrada: webhooks do ClickUp
src/
  config/
    statusMapping.ts   # Mapeamento de status Linte → ClickUp
  handlers/
    linteStatusUpdate.ts      # Fluxo 1: atualiza tarefa no ClickUp
    clickupPaymentRequest.ts  # Fluxo 2: envia comentário na Linte
  services/
    linte.ts     # Cliente GraphQL da Linte
    clickup.ts   # Cliente REST do ClickUp
```

---

## Fluxos

### Fluxo 1 — Linte → ClickUp (sync de status)

**Trigger:** Webhook `REQUISITION_STATUS_WAS_UPDATED_WEBHOOK` em `api/webhooks/linte.ts`

**Lógica:**
1. Recebe evento com código da requisição (ex: `ALU-HSCAMS`) e novo status
2. Consulta `statusMapping.ts` — se não mapeado, apenas loga e retorna 200
3. Busca tarefa no ClickUp pelo campo customizado **"Código Linte"**
4. Atualiza status da tarefa encontrada

**Edge cases:**
- Status não mapeado → logar e ignorar (não retornar erro)
- Tarefa não encontrada no ClickUp → logar erro, retornar 200 (não reprocessar)

**Busca de tarefa por Código Linte:**
Usa `findTaskByLinteCode` em `src/services/clickup.ts`, que filtra via query param na API do ClickUp (`custom_fields=[...]`). O UUID do campo "Código Linte" é resolvido dinamicamente via `GET /list/{LIST_ID}/field` (função privada `getListCustomFieldId`) e cacheado em memória por processo — evita uma chamada extra a cada webhook. Se a API falhar ou o campo não existir, o cache não é populado e a próxima chamada tenta novamente.

> `searchTasksByCustomField` (busca paginada com filtro em memória) ainda existe no serviço mas não é usada pelo handler. Foi mantida para uso futuro caso seja necessário buscar por outros campos sem UUID conhecido.

---

### Fluxo 2 — ClickUp → Linte (pedido de pagamento)

**Trigger:** Webhook `taskCommentPosted` com texto **exato** `"pedido de pagamento enviado"` em `api/webhooks/clickup.ts`

**Lógica:**
1. Recebe evento com ID da tarefa
2. Busca tarefa no ClickUp para ler campo **"Tipo de prestador"**
3. Comportamento por tipo:
   - `RPA` / `INVOICE` → envia comentário simples na demanda Linte
   - `PJ` → busca último anexo da tarefa (a NF) e envia comentário com URL na Linte

**Edge cases:**
- Campo "Tipo de prestador" ausente ou valor não reconhecido → logar e não processar
- Tarefa PJ sem anexo → logar aviso, não enviar comentário
- Comentário que não seja exatamente "pedido de pagamento enviado" → ignorar silenciosamente

---

## Serviços

### `src/services/linte.ts`
- Protocolo: **GraphQL**
- Base URL: `https://api.linte.com/graphql`
- Auth: header `key: <LINTE_API_KEY>`

### `src/services/clickup.ts`
- Protocolo: **REST**
- Base URL: `https://api.clickup.com/api/v2`
- Auth: header `Authorization: <CLICKUP_API_TOKEN>`

---

## Variáveis de ambiente

```
LINTE_API_KEY=          # Chave de autenticação da API da Linte
CLICKUP_API_TOKEN=      # Token pessoal ou OAuth do ClickUp
CLICKUP_LIST_ID=        # ID da lista onde as tarefas estão
POSTGRES_URL=           # Connection string do Neon Postgres (ex: postgres://user:pass@host/db)
TEAMS_WEBHOOK_URL=      # URL do webhook do canal do Teams para o relatório diário
CRON_SECRET=            # Segredo injetado pela Vercel nos cron jobs (gerado automaticamente)
```

> Em desenvolvimento local, criar `.env.local` na raiz. Nunca commitar esse arquivo.

> **Schema do banco:** após configurar `POSTGRES_URL`, criar a tabela uma vez chamando `ensureSchema()` de `src/lib/db.ts`. O logger (`src/services/logger.ts`) não cria a tabela automaticamente — ela precisa existir antes.

---

## Mapeamento de status (Linte → ClickUp)

| Linte                        | ClickUp                  |
|------------------------------|--------------------------|
| DP \| Em Aberto              | EM ANÁLISE               |
| DP \| Aguardando Assinatura  | ENVIADO PARA ASSINATURA  |
| DP \| Ativo                  | CONTRATO ATIVO           |
| Sob Análise do Jurídico      | AGUARDANDO PAGAMENTO     |
| demais                       | ignorar (logar)          |

Para **adicionar um novo mapeamento**, editar apenas `src/config/statusMapping.ts` — nenhuma outra alteração é necessária.

---

## Convenções

- Todos os webhooks retornam **HTTP 200** mesmo em erros inesperados (`{ ok: false, error: "..." }`). Retornar 500 acionaria a política de retry do ClickUp/Linte, causando reprocessamento duplicado (ex: comentário enviado duas vezes na Linte). 4xx/5xx apenas para falhas de infraestrutura fora do controle da função.
- Logs devem incluir contexto: ID da tarefa, código Linte, status recebido.
- Não lançar exceções não tratadas nos handlers — capturar e logar.
- TypeScript strict mode ativo; evitar `any`.

### Código removido intencionalmente

- **`sendMessageWithFile` (`src/services/linte.ts`)** — removida por ser código morto. O schema da mutation `sendRequisitionMessageWithFiles` nunca foi confirmado e a função nunca foi chamada. O fluxo PJ envia a URL da NF colada no texto via `sendMessage`, o que é suficiente. Se futuramente for necessário enviar arquivo como anexo dentro da Linte, implementar do zero com o schema confirmado.

---

## Segurança dos Webhooks

- Validar que requisições chegam dos IPs/origens esperados, se a Linte ou ClickUp fornecerem assinatura de payload.
- Não logar valores de campos sensíveis (ex: URLs de NF, dados de contratos).

---

## Troubleshooting

| Sintoma | Causa provável | Verificação |
|---|---|---|
| Tarefa não encontrada | Campo "Código Linte" vazio ou formato diferente | Confirmar valor exato no ClickUp (ex: `ALU-HSCAMS`) |
| Status não atualiza | Status da Linte não está no mapeamento | Checar log — deve aparecer como "ignorado" |
| Comentário não enviado (PJ) | Sem anexo na tarefa | Confirmar que NF foi anexada antes do comentário |
| Webhook não dispara | URL de webhook errada no painel | Confirmar URL no painel da Linte e do ClickUp |
