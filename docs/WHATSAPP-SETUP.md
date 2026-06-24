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
> Rode o smoke test local primeiro: `npm run smoke:webhook`

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
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Opcional | ID da conta business |
| `WHATSAPP_APP_SECRET` | Recomendado | Para validar assinatura HMAC |
| `OPENAI_API_KEY` | Opcional | Para usar IA real (sem ele, usa Mock) |
| `AI_PROVIDER` | Opcional | `openai` ou deixar vazio para mock |
| `APP_BASE_URL` | Recomendado | URL pública do sistema |

---

## Checklist antes de ativar o WhatsApp

- [ ] App publicado na Vercel com URL HTTPS
- [ ] Todas as variáveis configuradas no painel da Vercel
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

```
Usuário envia mensagem pelo WhatsApp
          ↓
Meta → POST /api/webhook/whatsapp
          ↓
Webhook responde 200 imediatamente
          ↓ (assíncrono)
Verifica idempotência (external_message_id)
          ↓
Salva em incoming_messages
          ↓
É resposta SIM/NÃO? → Aprovação de pending_action
          ↓ (se não)
IA interpreta mensagem (Mock ou OpenAI)
          ↓
Cria pending_action ou occurrence
          ↓
Envia resposta pelo WhatsApp Cloud API
```
