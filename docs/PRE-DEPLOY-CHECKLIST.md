# Checklist Pré-Deploy

Utilize esta lista antes de dar o `git push` para a Vercel.

## 1. Qualidade e Testes de Código
- [x] O comando `npm run lint` passou (sem erros críticos, as regras para mvp estão configuradas).
- [x] O comando `npm run typecheck` passou (sem erros de compilação TS).
- [x] O comando `npm run build` construiu os estáticos sem quebrar.
- [x] O comando `npm run smoke:occurrences` concluiu com sucesso (Banco operante).
- [x] O comando `npm run smoke:openai-text` concluiu com sucesso (OpenAI conectada).
- [x] O comando `npm run stress:openai-safety` obteve 20/20 (Defesas armadas).

## 2. Auditoria de Segurança (Secrets e RLS)
- [x] Nenhuma policy `public / anon` aberta com `insert` em tabelas críticas (Migration 08 aplicada).
- [x] O arquivo `.env.local` está listado no `.gitignore`.
- [x] O arquivo `src/app/globals.css` não tem variáveis secretas vazadas.
- [x] `SUPABASE_SERVICE_ROLE_KEY` é invocada estritamente no pacote `server` ou actions, NUNCA no frontend.
- [x] O `Dashboard` não usa mais `generateMockData()` e puxa estatísticas reais da nuvem.

## 3. Experiência de Uso Atual
- [x] A paleta de cores (Verde Safra/Terra Escura) foi aplicada no `globals.css` como pedido.
- [x] Botões possuem hover e indicativos visuais (Ícones Lucide).
- [x] Sidebar implementada e limpa.
- [x] Interface exibe os contadores (Total de Cabeças, Gastos/Lucros do Mês).

## STATUS
**Pronto para Vercel Staging.** Apenas lembre de subir as chaves manualmente no painel web da Vercel.
