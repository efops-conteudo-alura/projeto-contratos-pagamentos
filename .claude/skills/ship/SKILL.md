---
name: ship
description: Executa o fluxo completo de commit, push e acompanhamento de deploy na Vercel para o projeto Linte-ClickUp. Use quando o usuário quiser commitar, deployar, fazer ship, ou entregar as alterações atuais.
---

# Skill: Ship — Commit + Push + Deploy

Executa o fluxo completo de entrega das alterações atuais do projeto Linte-ClickUp.

## Passos

### 1. Verificar o que mudou
```bash
git status
git diff --stat
```
Mostre ao usuário um resumo das alterações antes de continuar.

### 2. Verificar build
```bash
npx tsc --noEmit
```
Se houver erros de TypeScript, **pare aqui** e informe o usuário. Não commite com erros de tipo.

### 3. Sugerir mensagem de commit
Com base nas alterações encontradas, crie uma mensagem de commit no formato:
```
tipo: descrição curta em pt-BR
```
Tipos: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`

Gere e execute a mensagem diretamente sem pedir confirmação.

### 4. Executar commit e push
```bash
git add .
git commit -m "mensagem gerada"
git push
```

### 5. Acompanhar o deploy
Após o push, use o MCP da Vercel para:
- Buscar o deploy mais recente do projeto
- Aguardar o status final (`READY` ou `ERROR`)
- Se **READY**: informe com a URL do deploy ✅
- Se **ERROR**: busque os logs de build automaticamente e apresente o erro com sugestão de correção

---

## Comportamento esperado

- Nunca commite sem mostrar o resumo das alterações primeiro
- Nunca commite se `tsc --noEmit` retornar erros
- Se o push falhar, informe o erro e não tente acompanhar o deploy
- Se não houver MCP da Vercel configurado, informe o usuário e encerre após o push
