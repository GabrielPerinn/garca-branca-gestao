# WhatsApp Cloud API — Guia de Configuração Completo

## Pré-requisitos

- Conta no **Meta for Developers**: https://developers.facebook.com
- Conta **Meta Business Suite** verificada: https://business.facebook.com
- Sistema publicado em URL HTTPS pública (Vercel, Railway, etc.)
- Arquivo `.env.local` com as variáveis listadas abaixo

---

## Passo 1 — Criar o App no Meta for Developers

1. Acesse https://developers.facebook.com/apps
2. Clique em **"Criar aplicativo"**
3. Selecione tipo: **"Business"** → clique em Avançar
4. Preencha:
   - **Nome do app**: `Garca Branca Gestao`
   - **E-mail de contato**: seu e-mail
   - **Conta Business**: selecione sua conta
5. Clique em **"Criar aplicativo"**

---

## Passo 2 — Adicionar o produto WhatsApp

1. No painel do app, procure **"Adicionar produtos"**
2. Clique em **"Configurar"** no card **WhatsApp**
3. Selecione sua **Meta Business Account**
4. O painel do WhatsApp aparecerá na barra lateral

---

## Passo 3 — Obter as variáveis de ambiente

### `WHATSAPP_PHONE_NUMBER_ID`

1. Menu lateral → **WhatsApp** → **Configuração da API**
2. Seção **"Enviar e receber mensagens"**
3. Campo **"De"** → copie o número de telefone de teste
4. Abaixo do número, clique em **"Ver detalhes do número"**
5. Copie o **Phone Number ID** (formato: `123456789012345`)

```
WHATSAPP_PHONE_NUMBER_ID=123456789012345
```

### `WHATSAPP_BUSINESS_ACCOUNT_ID`

1. Menu lateral → **WhatsApp** → **Configuração da API**
2. No topo da página, ao lado de "WhatsApp Business Account"
3. Copie o ID (formato: `123456789012345`)

```
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789012345
```

### `WHATSAPP_ACCESS_TOKEN`

**Opção A — Token temporário (teste, expira em 24h):**
1. **WhatsApp** → **Configuração da API**
2. Seção **"Token de acesso temporário"**
3. Clique em **"Gerar token"** e copie

**Opção B — Token permanente (produção):**
1. Acesse https://developers.facebook.com/tools/explorer
2. Selecione seu App
3. Clique em **"Gerar token de acesso de usuário"**
4. Adicione as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copie o token gerado
6. **IMPORTANTE**: Para produção, use **System User Token** via Business Manager:
   - https://business.facebook.com/settings/system-users
   - Crie um System User → Adicione ao app → Gere token sem expiração

```
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxx...
```

### `WHATSAPP_VERIFY_TOKEN`

Você cria este valor. Use qualquer string aleatória e segura:

```bash
# Gerar no terminal:
openssl rand -hex 32
```

```
WHATSAPP_VERIFY_TOKEN=a1b2c3d4e5f6789abcdef123456789abcdef
```

### `WHATSAPP_APP_SECRET`

1. Painel do app → **Configurações** → **Básico**
2. Campo **"Chave secreta do app"** → clique em **"Mostrar"**
3. Copie o valor

```
WHATSAPP_APP_SECRET=abc123def456...
```

Em produção, essa variável é obrigatória: o endpoint rejeita requisições sem uma
assinatura HMAC válida.

### Autorizar os remetentes

Por segurança, somente números autorizados são processados. Cadastre o telefone
em `users_profiles.phone_number` com o perfil ativo ou informe uma lista em formato
internacional, separada por vírgulas:

```dotenv
WHATSAPP_ALLOWED_PHONES=5569999999999,5569888888888
```

### Remetente do smoke test

O smoke simula uma mensagem recebida e, portanto, precisa usar um telefone que o
webhook reconheça como autorizado. Defina-o explicitamente no `.env.local`:

```dotenv
WHATSAPP_SMOKE_TEST_PHONE=5569999999999
```

Se essa variável estiver vazia, o script usa o primeiro número de
`WHATSAPP_ALLOWED_PHONES`. Um número informado apenas em
`WHATSAPP_SMOKE_TEST_PHONE` ainda precisa existir na allowlist ou pertencer a um
perfil ativo em `users_profiles.phone_number`.

---

## Passo 4 — Configurar o Webhook

1. Menu lateral → **WhatsApp** → **Configuração** → **Webhook**
2. Clique em **"Editar"**
3. Preencha:
   - **URL de retorno de chamada**: `https://SEU-APP.vercel.app/api/webhook/whatsapp`
   - **Token de verificação**: o valor de `WHATSAPP_VERIFY_TOKEN`
4. Clique em **"Verificar e salvar"**
   - A Meta vai fazer um GET na URL e verificar o challenge
   - Se aparecer ✅ verde, o webhook está conectado

5. Na seção **"Campos do webhook"**, assine:
   - ✅ `messages`

6. Clique em **"Salvar"**

> ⚠️ **O webhook precisa estar publicado ANTES de clicar em "Verificar".**
> Rode `npm run smoke:webhook` somente contra um ambiente local ou de staging. O
> script grava dados, assina cada POST com `WHATSAPP_APP_SECRET` e pode enviar uma
> resposta real quando as credenciais de envio da Meta estiverem configuradas.

---

## Passo 5 — Testar com o número de teste da Meta

A Meta fornece um número de teste gratuito sem precisar de aprovação:

1. **WhatsApp** → **Configuração da API**
2. Seção **"Enviar uma mensagem de teste"**
3. Adicione seu número pessoal como destinatário
4. Clique em **"Enviar mensagem"** — você receberá uma mensagem de confirmação no WhatsApp
5. **Responda qualquer coisa** para esse número — a mensagem chegará no webhook

**Limitações do número de teste:**
- Só funciona com números explicitamente adicionados na lista
- Limite de 1.000 mensagens/mês gratuitas
- Não precisa aprovação de template

---

## Passo 6 — Migrar para número real

### Opção A: Usar um número novo (recomendado)
1. **WhatsApp** → **Gerenciamento de números de telefone** → **Adicionar número**
2. Insira o número (precisa ser um chip que você controla)
3. Valide via SMS ou chamada
4. Siga o fluxo de aprovação da Meta

### Opção B: Migrar número existente do WhatsApp
1. O número **perderá acesso ao app WhatsApp pessoal**
2. Menu lateral → **Gerenciamento de números** → **Migrar número**
3. Confirme no app pessoal antes de migrar

### Aprovação de templates (para mensagens ativas)
Para enviar mensagens **para clientes que nunca te enviaram nada primeiro**:
1. **WhatsApp** → **Gerenciador de templates**
2. Crie templates em português (ex: alertas, confirmações)
3. Aguarde aprovação da Meta (24–48h)

Para o sistema Garça Branca, o fluxo é **reativo** (usuário envia → sistema responde), então templates não são necessários para o fluxo principal.

---

## Variáveis de ambiente necessárias

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Sim | Chave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Sim | Chave secreta (nunca expor no frontend) |
| `WHATSAPP_VERIFY_TOKEN` | ✅ Sim | Token criado por você para verificação |
| `WHATSAPP_ACCESS_TOKEN` | ✅ Sim | Token de acesso da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ Sim | ID do número no Meta |
| `WHATSAPP_GRAPH_API_VERSION` | Opcional | Versão da Graph API no envio; padrão `v23.0` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Opcional | ID da conta business |
| `WHATSAPP_APP_SECRET` | ✅ Sim em produção | Valida a assinatura HMAC da Meta |
| `WHATSAPP_ALLOWED_PHONES` | Condicional | Números autorizados quando não estão em `users_profiles` |
| `WHATSAPP_SMOKE_TEST_PHONE` | Somente no smoke | Remetente autorizado usado no teste; fallback para o primeiro número da allowlist |
| `OPENAI_API_KEY` | Opcional | Para usar OpenAI; sem ela, usa o motor local |
| `AI_PROVIDER` | Opcional | `openai` ou `mock`; com chave, vazio usa OpenAI |
| `OPENAI_MODEL` | Opcional | Modelo estruturado; padrão `gpt-5.6` |
| `APP_BASE_URL` | Recomendado | URL pública do sistema |

---

## Checklist antes de ativar o WhatsApp

- [ ] App publicado na Vercel com URL HTTPS
- [ ] Todas as variáveis configuradas no painel da Vercel
- [ ] Telefones autorizados em `users_profiles` ou `WHATSAPP_ALLOWED_PHONES`
- [ ] `WHATSAPP_SMOKE_TEST_PHONE` aponta para um desses telefones autorizados
- [ ] `GET /api/health` retornando `status: healthy`
- [ ] `npm run smoke:webhook` passando com 0 falhas
- [ ] Webhook verificado no painel da Meta (✅ verde)
- [ ] Campo `messages` assinado no webhook
- [ ] Testou enviar mensagem pelo número de teste e recebeu resposta
- [ ] `incoming_messages` sendo criada no Supabase
- [ ] `pending_actions` sendo criada no Supabase
- [ ] Testou responder SIM pelo WhatsApp e ver execução no banco

---

## Fluxo de mensagem (resumo)

### Entradas aceitas

- Texto: até 4.000 caracteres por mensagem processada.
- Áudio: formatos suportados pelo transcritor, até 25 MB.
- Foto: JPEG, PNG ou WebP, até 5 MB.
- Documento: PDF válido, até 50 MB. Outros formatos de documento são recusados.

Ao receber uma nota, recibo, boleto ou comprovante em PDF, a Garça guarda o
original no bucket privado `ai-evidence`, lê o texto e as imagens das páginas e
prepara uma ou mais despesas. Valor final, fornecedor, datas, número/chave
fiscal, vencimento, forma e situação do pagamento são preservados quando
visíveis. O sistema não presume que uma nota está paga: pergunta o que estiver
faltando, uma informação por vez, e só grava após a resposta e a confirmação
explícita. A chave de acesso da NF-e impede cadastro duplicado.

```
Usuário envia texto, áudio, foto ou PDF pelo WhatsApp
          ↓
Meta → POST /api/webhook/whatsapp
          ↓
Valida Content-Type, tamanho e assinatura HMAC
          ↓
Webhook responde 200 imediatamente
          ↓ (assíncrono)
Verifica idempotência (external_message_id e chave fiscal quando disponível)
          ↓
Salva em incoming_messages
          ↓
É resposta SIM/NÃO? → Aprovação de pending_action
          ↓ (se não)
Guarda a mídia original como evidência privada
          ↓
IA transcreve/lê e interpreta a mensagem
          ↓
Cria pending_action ou occurrence
          ↓
Envia resposta pelo WhatsApp Cloud API
```

O smoke não executa `DELETE` físico. Ações pendentes de teste são descartadas,
ocorrências são arquivadas e a `incoming_message` é anonimizada, mas seu
identificador permanece retido para idempotência e auditoria.
