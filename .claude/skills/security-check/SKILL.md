---
name: security-check
description: Realiza uma auditoria de segurança no projeto de integração Linte-ClickUp. Use quando o usuário pedir para verificar segurança, fazer security check, auditar o projeto, ou antes de um deploy em produção.
---

# Skill: Security Check — Linte-ClickUp

Você vai realizar uma auditoria de segurança sistemática no projeto de integração entre Linte e ClickUp. O projeto usa TypeScript, serverless functions na Vercel, e se comunica com APIs externas via API keys.

Execute cada verificação abaixo em ordem. Para cada problema encontrado, registre o arquivo, a linha e a severidade.

---

## 1. Variáveis de ambiente

Leia todos os arquivos em `src/` e `api/` e verifique:

- As três variáveis obrigatórias (`LINTE_API_KEY`, `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID`) são acessadas via `process.env` e nunca hardcoded
- Nenhuma chave ou token aparece literal no código
- Nenhuma variável de ambiente é logada com `console.log` (risco de exposição em logs da Vercel)

Sinalize como **CRÍTICO** qualquer chave hardcoded ou logada diretamente.

---

## 2. Ausência de autenticação nos webhooks

Leia `api/webhooks/linte.ts` e `api/webhooks/clickup.ts` e verifique:

- Os endpoints aceitam qualquer POST sem validação de origem
- Se a Linte ou ClickUp fornecem assinatura de payload (ex: header `X-Webhook-Signature`), ela está sendo verificada?

Sinalize como **ALTO** a ausência de validação de origem, com sugestão de implementar verificação de assinatura ou allowlist de IPs se as APIs suportarem.

> Nota: ausência de autenticação é esperada se as APIs não fornecem mecanismo de assinatura — nesse caso, apenas documente como risco aceito.

---

## 3. Dados sensíveis em logs

Verifique todos os `console.log` e `console.error` do projeto:

- URLs de anexos (NFs) não devem ser logadas integralmente
- Conteúdo de comentários ou mensagens não deve ser logado
- IDs internos da Linte podem ser logados (baixo risco)
- IDs de tarefas do ClickUp podem ser logados (baixo risco)

Sinalize como **MÉDIO** qualquer log que exponha dados de negócio sensíveis.

---

## 4. Inputs não validados vindos dos webhooks

Verifique os handlers em `src/handlers/`:

- Campos de payload são acessados com optional chaining antes de usar?
- Strings vindas do webhook são comparadas com `.trim()` e `.toLowerCase()` onde relevante?
- O código quebra se um campo esperado vier `null` ou `undefined`?

Sinalize como **ALTO** qualquer acesso direto a campo de payload externo sem verificação.

---

## 5. Injeção via query string na API do ClickUp

Verifique `src/services/clickup.ts`:

- O valor de `linteCode` (vindo do webhook da Linte) é encodado com `encodeURIComponent(JSON.stringify(...))` antes de ser interpolado na URL?
- Há outros pontos onde dados externos são interpolados em URLs sem encoding?

Sinalize como **ALTO** qualquer interpolação de dado externo em URL sem encoding adequado.

---

## 6. Dependências

```bash
npm audit --audit-level=high
```

Reporte apenas vulnerabilidades **high** ou **critical**. Ignore avisos de nível baixo/médio a menos que sejam em dependências diretamente usadas no runtime.

---

## Formato do relatório

```
# Security Check — Linte-ClickUp
Data: [hoje]

## Resumo
- 🔴 Críticos: X
- 🟠 Altos: X
- 🟡 Médios: X
- ✅ Sem problemas encontrados em: [lista das categorias limpas]

## Problemas encontrados

### 🔴 CRÍTICO — [título]
**Arquivo:** `caminho/do/arquivo.ts`
**Linha:** XX
**Problema:** descrição clara
**Correção sugerida:**
\`\`\`ts
// código corrigido
\`\`\`

---

## O que foi verificado e está OK
[lista dos itens sem problemas]

## Riscos aceitos
[itens que são limitações conhecidas das APIs externas, sem mitigação possível]
```

---

## Importante

- Leia os arquivos reais — não assuma que estão corretos
- Não sinalize falsos positivos — só reporte o que é genuinamente um risco
- Se encontrar algo fora das categorias acima que pareça um risco, adicione em "Outros achados"
- Distingua entre "risco mitigável" e "limitação da API externa" — ambos devem aparecer no relatório, mas separados
