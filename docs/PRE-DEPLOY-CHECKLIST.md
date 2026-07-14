# Checklist pré-deploy

Este checklist deve ser preenchido novamente para cada commit candidato a deploy.
Uma caixa marcada em uma versão anterior não comprova o estado da versão atual.

## 1. Qualidade obrigatória

- [ ] `npm ci` concluiu usando o lockfile versionado.
- [ ] `npm run lint` passou sem erros.
- [ ] `npm run typecheck` passou.
- [ ] `npm test` passou sem testes ignorados ou instáveis.
- [ ] `npm run build` passou sem avisos de configuração ignorados.
- [ ] A migration completa foi aplicada do zero em um Supabase local descartável.
- [ ] As migrations pendentes foram revisadas e testadas sobre uma cópia de staging.
- [ ] O diff do lockfile e o resultado de `npm audit` foram revisados.

## 2. Testes funcionais em staging

- [ ] Login e logout foram validados com um usuário sem privilégios especiais.
- [ ] Recuperação de senha foi validada e a URL `<APP_BASE_URL>/auth/callback` está autorizada em Authentication → URL Configuration no Supabase.
- [ ] Criação, edição/conclusão e soft delete dos módulos afetados foram testados.
- [ ] Dashboard e listas exibem dados reais e estados vazios/erro corretamente.
- [ ] `GET /api/health` responde sem exigir sessão e sem revelar segredos.
- [ ] Verificação GET e entrega POST do webhook foram testadas pela Meta.
- [ ] Assinaturas inválidas do webhook são rejeitadas sem processar o payload.
- [ ] Confirmações e rejeições de ações de IA foram testadas sem duplicidade.
- [ ] Os smokes necessários foram executados somente no banco descartável de staging.

## 3. Segurança e operação

- [ ] `.env.local` e todos os segredos continuam fora do Git.
- [ ] `ADMIN_EMAIL` e `ADMIN_PASSWORD` foram usados apenas no bootstrap e removidos do ambiente quando possível.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` existe somente no runtime de servidor.
- [ ] Policies RLS foram revisadas para todas as tabelas acessadas pelo cliente.
- [ ] Rotas e Server Actions validam autenticação/autorização no servidor.
- [ ] `WHATSAPP_APP_SECRET` está configurado no ambiente publicado.
- [ ] Backup e plano de rollback foram preparados antes de alterar produção.
- [ ] Logs, alertas e monitoramento do health check estão configurados.
- [ ] O job `redact_expired_incoming_messages` está agendado e monitorado.
- [ ] O environment `production` do GitHub exige revisão antes do job de migrations.

## 4. Experiência e acessibilidade

- [ ] Fluxos críticos foram verificados em desktop e celular.
- [ ] Estados de loading, erro, vazio e 404 foram inspecionados.
- [ ] Formulários exibem feedback de sucesso/erro e impedem envio duplicado.
- [ ] Navegação por teclado, foco visível e textos de botões foram revisados.

## Evidências da versão

- Commit avaliado: `______________________________`
- Ambiente de staging: `______________________________`
- Responsável: `______________________________`
- Data: `____/____/________`
- Resultado: [ ] aprovado para staging  [ ] aprovado para produção  [ ] bloqueado

## Estado conhecido em 13/07/2026

- As 23 migrations foram aplicadas do zero com `supabase db reset` em uma pilha
  local descartável. Banco, Auth, API, Storage, Realtime, Studio e Mailpit ficaram
  saudáveis; somente Analytics/Vector estão desabilitados porque não fazem parte
  do runtime da aplicação.
- As migrations locais e remotas estão sincronizadas até
  `20260713000005_single_farm_mode.sql`.
- A suíte automatizada possui 33 testes de domínio. Os smokes desta versão
  passaram para ocorrências, OpenAI real (7/7), estresse de segurança da IA
  (20/20) e webhook assinado do WhatsApp (22/22).
- O fluxo autenticado IA → ação pendente → aprovação → gravação de
  cascalhamento foi validado no navegador e os dados de teste foram arquivados.
- O envio real pelo WhatsApp continua condicionado a um app/número da Meta e às
  respectivas credenciais de produção. O recebimento local, HMAC, allowlist,
  idempotência, processamento assíncrono e limpeza já estão comprovados.
- A propriedade principal ainda precisa receber os dados verdadeiros da fazenda
  pelo onboarding; nenhum dado jurídico, territorial ou pecuário foi inventado.
- Nenhum deploy de produção é aprovado apenas por este documento: HTTPS público,
  credenciais da Meta, backup e monitoramento precisam ser verificados no ambiente
  candidato.
