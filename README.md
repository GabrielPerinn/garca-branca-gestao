# Garça Branca — Gestão Pecuária com IA

Aplicação web para centralizar uma operação pecuária formada por uma ou várias
propriedades: financeiro, rebanho, pastagens, estoque, equipe, tarefas,
documentos, alertas e registros de campo.
Mensagens em linguagem natural podem ser interpretadas pela IA e transformadas
em ações pendentes, sempre sujeitas à revisão humana antes da execução.

## Recursos implementados

- Painel operacional com indicadores financeiros, rebanho, tarefas, alertas e estoque baixo
- Implantação guiada da operação pecuária, com várias propriedades físicas, matrículas, CAR/CCIR/CIB, pastos por propriedade, máquinas, benfeitorias, saldo inicial do rebanho, equipe e estoque em uma única transação
- Gestão de contratos rurais separando arrendamento, parceria, comodato e subarrendamento, com parcelas, baixa financeira idempotente, alertas de cobrança/renovação e interpretação supervisionada pela IA
- Relatório gerencial por período com evolução mensal, categorias, prioridades operacionais e exportação CSV segura
- Uma operação pecuária consolidada com múltiplas propriedades, preservando análise conjunta e detalhamento por fazenda
- Cadastros de pastos, lotes, funcionários, vendas, documentos e operações de campo
- Sanidade e reprodução coletivas por lote, categoria, propriedade ou operação, com produto, dose, carência, responsável, recorrência, histórico e alarmes automáticos
- PWA instalável com pacote de trabalho e diário offline idempotente para sanidade, pesagens manuais, rebanho, tarefas, estoque e despesas; fotos e áudios ficam no aparelho e são processados pela Garça quando a conexão retorna
- Assistente e simulador de IA com validação estruturada e aprovação humana
- IA transacional para cascalhamento e supressão vegetal, com exigência de autorização e dados operacionais antes da confirmação
- WhatsApp assinado por HMAC, remetentes autorizados, idempotência e confirmação vinculada à conversa
- Consultas pelo WhatsApp baseadas no banco para financeiro mensal, rebanho, tarefas, estoque e contas a receber
- Movimentações de estoque transacionais, com bloqueio de saldo negativo e reversão segura
- Soft delete, trilha de auditoria, estados globais de erro/carregamento e navegação responsiva
- Garça Twin com livro de eventos imutável, cadeia de hash verificável, relações temporais e histórico automático de todas as operações
- Proteção de dados em camadas: exclusão física bloqueada, checagem diária de integridade, backup criptografado independente do Supabase (banco + Auth + Storage), retenção de 90 dias e ensaio automático de restauração com comparação de todas as tabelas
- Autopiloto Operacional supervisionado com sete regras determinísticas, execução diária, reconciliação automática de riscos e preparação transacional de tarefas para aprovação
- Laboratório de Decisões com cenários reproduzíveis, linha de base real, premissas explícitas, impacto financeiro, capacidade pecuária, confiança dos dados e metas mensuráveis

## Stack

- Next.js 16 com App Router, React 19 e TypeScript estrito
- Supabase para autenticação e PostgreSQL
- OpenAI para interpretação opcional de mensagens
- WhatsApp Cloud API para entrada de mensagens de campo
- Tailwind CSS 4 para a interface

## Requisitos

- Node.js 20.9 ou superior
- npm
- Um projeto Supabase ou Supabase CLI + Docker para desenvolvimento local
- Chaves da OpenAI e da Meta apenas para os fluxos opcionais de IA/WhatsApp

## Configuração local

1. Instale exatamente as dependências registradas no lockfile:

   ```bash
   npm ci
   ```

2. Crie o arquivo local de ambiente:

   ```bash
   cp .env.example .env.local
   ```

3. Preencha ao menos as três variáveis do Supabase. Nunca use a service role no
   navegador nem versione `.env.local`.

4. Aplique as migrations em um banco local ou de desenvolvimento. Para uma
   instância local do Supabase:

   ```bash
   npx supabase start
   npx supabase db reset
   ```

   O projeto desabilita apenas o explorador local de logs do Supabase, que não é
   usado pela aplicação. Banco, Auth, REST, Storage, Realtime, Studio e e-mail local
  continuam disponíveis. A pilha e as 42 migrations foram validadas do zero com
   Supabase CLI 2.109.1 e Colima no macOS.

5. Para criar o primeiro usuário, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` e rode:

   ```bash
   npx tsx create-admin.ts
   ```

   A senha precisa ter no mínimo 12 caracteres e nunca é impressa pelo script.
   No projeto Supabase remoto, desative também o cadastro público de usuários no
   painel de autenticação; `supabase/config.toml` configura apenas o ambiente local.
   Todo usuário criado depois do bootstrap também precisa de um registro ativo em
   `users_profiles`; sem esse vínculo, o acesso web e as ações da IA são recusados.

6. Inicie o projeto:

   ```bash
   npm run dev
   ```

   O desenvolvimento usa Webpack por padrão por estabilidade neste projeto. Para
   diagnosticar ou testar o compilador Turbopack explicitamente, use
   `npm run dev:turbopack`.

   A aplicação estará disponível em [http://localhost:3000](http://localhost:3000).

7. Entre com o administrador e abra **Base da operação** no menu. Na primeira
   implantação, o Dashboard também exibe um atalho. Conclua essa etapa antes dos
   lançamentos diários: ela define a operação consolidada, cadastra cada
   propriedade física e cria os saldos iniciais usados nos relatórios e no
   contexto operacional da IA. Depois de
   concluída, a mesma área continua disponível para revisar os dados mestres;
   movimentações passam a ser feitas nos módulos específicos.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL pública do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave pública protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim no servidor | Operações administrativas; nunca expor ao cliente |
| `ADMIN_EMAIL` | Somente no bootstrap | E-mail do primeiro administrador |
| `ADMIN_PASSWORD` | Somente no bootstrap | Senha forte do primeiro administrador |
| `ADMIN_NAME` | Não | Nome exibido no perfil administrador |
| `OPENAI_API_KEY` | Não | Ativa o provedor real da OpenAI; sem chave, usa o motor local |
| `AI_PROVIDER` | Não | `openai` ou `mock`; com chave configurada, o padrão é `openai` |
| `OPENAI_MODEL` | Não | Modelo de interpretação estruturada; padrão `gpt-5.6` |
| `WHATSAPP_VERIFY_TOKEN` | Para WhatsApp | Validação inicial do webhook |
| `WHATSAPP_ACCESS_TOKEN` | Para WhatsApp | Envio de respostas pela Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Para WhatsApp | Identificador do número na Meta |
| `WHATSAPP_GRAPH_API_VERSION` | Não | Versão da Graph API usada no envio; padrão `v23.0`, atualize após validar na Meta |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Não | Identificador da conta Business |
| `WHATSAPP_APP_SECRET` | Sim em produção | Validação HMAC das requisições da Meta |
| `WHATSAPP_ALLOWED_PHONES` | Para WhatsApp | Números autorizados, em formato internacional e separados por vírgula; perfis ativos com telefone também são aceitos |
| `WHATSAPP_SMOKE_TEST_PHONE` | Somente no smoke | Remetente autorizado usado pelo teste; se vazio, usa o primeiro número de `WHATSAPP_ALLOWED_PHONES` |
| `APP_BASE_URL` | Em deploy | URL HTTPS pública, sem barra final |
| `APP_TIMEZONE` | Recomendado | Fuso das datas civis; padrão `America/Porto_Velho` |

## Verificações de qualidade

Antes de abrir um pull request ou publicar:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Os scripts `smoke:*` e `stress:openai-safety` não são testes unitários: eles podem
gravar dados no Supabase, enviar requisições a serviços externos e consumir cota.
Execute-os somente contra um ambiente de staging descartável e após revisar suas
variáveis de ambiente. O smoke do WhatsApp exige `WHATSAPP_APP_SECRET`, assina
todos os POSTs e precisa de `WHATSAPP_SMOKE_TEST_PHONE` ou do primeiro telefone
em `WHATSAPP_ALLOWED_PHONES`. Ao final, ele descarta/arquiva os dependentes e
anonimiza a mensagem recebida, que permanece retida para idempotência e auditoria.

## Banco e deploy

- As migrations ficam em `supabase/migrations` e devem ser testadas do zero antes
  de serem enviadas ao banco remoto.
- O workflow `database-backup.yml` cria diariamente uma cópia criptografada fora
  do Supabase e só a registra como verificada depois de restaurá-la em um banco
  descartável. Configure no environment `production` do GitHub os mesmos segredos
  do Supabase usados pelo deploy, incluindo `SUPABASE_SERVICE_ROLE_KEY`.
- A chave privada de recuperação nunca entra no GitHub ou no Supabase. Consulte
  `docs/DATA-PROTECTION-AND-RECOVERY.md` antes de trocar a chave ou recuperar dados.
- Faça um backup manual verificado antes de migrations de produção de alto risco.
- Configure segredos diretamente no provedor de deploy; nunca no repositório.
- Use `docs/PRE-DEPLOY-CHECKLIST.md` como bloqueio de publicação.
- Agende no ambiente de produção a chamada periódica
  `select public.redact_expired_incoming_messages(500);` com credencial de serviço;
  mensagens concluídas têm retenção padrão de 90 dias antes da anonimização.

## Estado do projeto

O sistema está em desenvolvimento ativo. Um build bem-sucedido não substitui a
validação das migrations, dos fluxos de autenticação, do webhook e das regras RLS
em staging. Não considere uma versão pronta para produção enquanto os itens
obrigatórios do checklist não estiverem comprovados para o commit a publicar.
