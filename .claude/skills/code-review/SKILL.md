---
name: code-review
description: Faz uma revisão profunda de qualidade de código no projeto de integração Linte-ClickUp. Use quando o usuário pedir para revisar, fazer code review, checar qualidade, verificar bugs, ou antes de adicionar um novo fluxo de webhook.
---

# Skill: Code Review — Linte-ClickUp

Você vai fazer uma revisão de qualidade em um arquivo ou área específica do projeto de integração entre Linte e ClickUp. O projeto usa TypeScript, serverless functions na Vercel, cliente GraphQL (Linte) e cliente REST (ClickUp).

## Antes de começar

Se o usuário não especificou o que revisar, pergunte:
- "Qual arquivo ou fluxo você quer que eu revise? (ex: `src/handlers/`, `src/services/clickup.ts`, um fluxo específico)"

Se especificou, leia o(s) arquivo(s) antes de qualquer análise. Se precisar de contexto de outro arquivo para entender a lógica, leia também.

---

## O que verificar

### 1. Edge cases de webhook
- O handler retorna 200 mesmo em erros de negócio? (padrão do projeto — evita retries)
- O que acontece se o payload chegar incompleto ou com campos ausentes?
- Duplo disparo do mesmo evento é tratado de forma segura (idempotência)?
- Eventos não reconhecidos são ignorados silenciosamente com log?

### 2. Integração com APIs externas
- Chamadas ao ClickUp e Linte estão dentro de try/catch?
- Erros de API (status não-2xx) são capturados e logados com contexto?
- O código depende de campos opcionais sem verificação (ex: `task.attachments?.[0]` sem fallback)?
- Há alguma chamada desnecessária à API que poderia ser evitada?

### 3. TypeScript
- Há uso de `any` que poderia ser tipado corretamente?
- Type assertions (`as Tipo`) sem verificação real?
- Retornos de função assíncrona estão tipados?
- Interfaces de payload de webhook estão cobrindo todos os campos usados?

### 4. Lógica de negócio
- O mapeamento de status (`statusMapping.ts`) é o único ponto de mudança para novos status?
- Comparações de string são case-sensitive onde não deveriam ser (ex: `tipoPrestador.toUpperCase()`)?
- O fluxo PJ verifica ausência de anexo antes de tentar usar?
- O trigger text `"pedido de pagamento enviado"` é comparado com `.toLowerCase().trim()`?

### 5. Consistência com o projeto
- Está usando `src/services/clickup.ts` e `src/services/linte.ts` — nunca chamando as APIs diretamente nos handlers?
- Logs incluem contexto suficiente: ID da tarefa, código Linte, status/evento recebido?
- `findTaskByLinteCode` está sendo usada em vez de `searchTasksByCustomField` para busca por Código Linte?
- `searchTasksByCustomField` está sendo usada apenas para buscas por outros campos?

### 6. Performance
- Há chamadas à API que poderiam ser cacheadas (ex: UUIDs de campos customizados)?
- Há paginação desnecessária sendo feita quando um filtro direto resolveria?
- Múltiplas chamadas sequenciais que poderiam ser paralelizadas com `Promise.all`?

---

## Formato do relatório

```
# Code Review — [nome do arquivo/fluxo]

## Resumo
[2-3 linhas sobre a qualidade geral]

## Problemas encontrados

### 🔴 Crítico — [título]
**Arquivo:** `caminho/do/arquivo.ts`
**Linha:** XX
**Problema:** descrição clara
**Correção sugerida:**
\`\`\`ts
// código corrigido
\`\`\`

### 🟠 Importante — [título]
[mesma estrutura]

### 🟡 Sugestão — [título]
[mesma estrutura]

## O que está bem feito
[lista de pontos positivos — sempre inclua isso]

## Próximos passos sugeridos
[lista priorizada do que corrigir primeiro]
```

---

## Importante

- Leia o código real antes de comentar — nunca assuma o conteúdo
- Separe problemas reais de preferências estilísticas — só reporte o que tem impacto real
- Sempre inclua pontos positivos
- Se o código estiver bom, diga isso claramente em vez de inventar problemas
