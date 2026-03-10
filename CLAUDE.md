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
- Múltiplas tarefas com mesmo código → logar aviso, atualizar a primeira

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
```

> Em desenvolvimento local, criar `.env.local` na raiz. Nunca commitar esse arquivo.

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

- Todos os webhooks devem retornar **HTTP 200** mesmo em erros de negócio (evita reenvios desnecessários). Retornar 4xx/5xx apenas para erros de infraestrutura ou payload inválido.
- Logs devem incluir contexto: ID da tarefa, código Linte, status recebido.
- Não lançar exceções não tratadas nos handlers — capturar e logar.
- TypeScript strict mode ativo; evitar `any`.

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
