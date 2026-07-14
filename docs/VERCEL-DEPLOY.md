# Deploy na Vercel — Guia Completo

## Pré-requisitos

- Conta na Vercel: https://vercel.com (gratuita no plano Hobby)
- Git configurado no projeto
- Repositório no GitHub (recomendado) ou GitLab/Bitbucket

---

## Passo 1 — Preparar o repositório

```bash
# Na pasta do projeto
cd /caminho/para/garca-branca-gestao

# Certificar que .gitignore está correto
cat .gitignore | grep -E "\.env|node_modules"

# Commit atual
git add -A
git commit -m "feat: pronto para deploy"
git push origin main
```

> ⚠️ **NUNCA** commite o arquivo `.env.local`. Ele deve estar no `.gitignore`.

---

## Passo 2 — Criar projeto na Vercel

### Via CLI (recomendado):
```bash
npx vercel

# Responda:
# → Set up and deploy? Yes
# → Link to existing project? No
# → Project name: garca-branca-gestao
# → In which directory is your code? ./
# → Override settings? No
```

### Via Dashboard:
1. Acesse https://vercel.com/new
2. Clique em **"Import Git Repository"**
3. Selecione o repositório
4. Framework preset: **Next.js** (detectado automaticamente)
5. Configure as variáveis da próxima seção antes de promover o ambiente
6. Clique em **"Deploy"**

---

## Passo 3 — Configurar variáveis de ambiente

No painel da Vercel: **Project Settings** → **Environment Variables**

### Variáveis PÚBLICAS (podem aparecer no browser)
| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` (chave anon pública) |

### Variáveis SECRETAS (apenas no servidor, nunca expose)
| Nome | Descrição |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do Supabase (Settings → API) |
| `WHATSAPP_VERIFY_TOKEN` | Token que você criou para verificar o webhook |
| `WHATSAPP_ACCESS_TOKEN` | Token de acesso da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número no painel da Meta |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID da conta Business |
| `WHATSAPP_APP_SECRET` | Chave secreta do app para validação HMAC |
| `WHATSAPP_ALLOWED_PHONES` | Números autorizados, em formato internacional e separados por vírgula |
| `OPENAI_API_KEY` | Chave da OpenAI (opcional, usa o motor local sem ela) |

### Variáveis opcionais
| Nome | Valor exemplo | Descrição |
|---|---|---|
| `AI_PROVIDER` | `openai` ou `mock` | Com chave, vazio usa OpenAI |
| `OPENAI_MODEL` | `gpt-5.6` | Modelo de interpretação estruturada |
| `APP_BASE_URL` | `https://seu-app.vercel.app` | URL pública do sistema |

Depois do primeiro deploy, adicione
`https://seu-app.vercel.app/auth/callback` às Redirect URLs em
**Supabase → Authentication → URL Configuration**. Sem essa autorização, os
links de recuperação de senha não conseguem retornar ao sistema.
| `APP_TIMEZONE` | `America/Porto_Velho` | Fuso usado nas datas operacionais |

> **Como adicionar na Vercel:**
> 1. Project Settings → Environment Variables
> 2. Para cada variável: preencha o nome, valor, selecione todos os ambientes (Production + Preview + Development)
> 3. Clique em "Save"
> 4. Faça um novo deploy para as variáveis entrarem em vigor

---

## Passo 4 — Redeploy com variáveis

Após adicionar as variáveis:
```bash
# Via CLI
npx vercel --prod

# Ou via dashboard: Deployments → Redeploy (último deploy)
```

---

## Passo 5 — Verificar o deploy

```bash
# Teste o health check
curl https://seu-app.vercel.app/api/health

# Resposta esperada:
{
  "status": "healthy",
  "timestamp": "2026-07-10T12:00:00.000Z",
  "latency_ms": 123,
  "checks": {
    "configuration": { "ok": true },
    "database": { "ok": true, "latency_ms": 120 }
  }
}
```

Um ambiente saudável responde HTTP 200. Falhas de configuração ou banco retornam
`status: degraded` com HTTP 503.

---

## Passo 6 — Testar o webhook publicado

```bash
# Configure no .env.local da máquina que executará o teste:
# APP_BASE_URL=https://seu-app.vercel.app
# WHATSAPP_SMOKE_TEST_PHONE=5569999999999
# WHATSAPP_APP_SECRET=<o mesmo segredo configurado no deploy>

# Rode o smoke test
npm run smoke:webhook
```

O telefone do smoke precisa estar em `WHATSAPP_ALLOWED_PHONES` no deploy ou em um
perfil ativo. Se `WHATSAPP_SMOKE_TEST_PHONE` estiver vazio, o script usa o primeiro
número da allowlist local. O smoke grava dados em staging, testa HMAC inválido e
anonimiza a mensagem ao final; não o execute contra produção.

---

## Passo 7 — Configurar domínio customizado (opcional)

1. Vercel Dashboard → **Project** → **Settings** → **Domains**
2. Adicione seu domínio: `gestao.garcabranca.com.br`
3. Configure o DNS conforme indicado pela Vercel:
   - `CNAME` → `cname.vercel-dns.com`
   - ou `A` → `76.76.21.21`
4. Aguarde propagação (5–60 minutos)

---

## Ambientes disponíveis na Vercel

| Ambiente | Quando é usado | URL |
|---|---|---|
| Production | Branch `main` | `seu-app.vercel.app` |
| Preview | Outros branches | `seu-app-git-branch.vercel.app` |
| Development | `vercel dev` local | `localhost:3000` |

---

## Scripts de deploy disponíveis

```bash
npm run deploy:preview
npm run deploy
```

---

## Troubleshooting

### Build falha com "Cannot find module"
```bash
# Limpe o cache local e rebuild
rm -rf .next node_modules
npm ci
npm run build
```

### Variável de ambiente não encontrada em produção
- Verifique se está marcada para ambiente **Production** na Vercel
- Faça redeploy após adicionar
- `NEXT_PUBLIC_*` variáveis ficam no bundle do browser — as outras só no servidor

### Webhook retornando 401 ou 503
- HTTP 401 indica que `X-Hub-Signature-256` não corresponde ao body e ao `WHATSAPP_APP_SECRET`
- HTTP 503 em produção indica, entre outras configurações, ausência de `WHATSAPP_APP_SECRET`
- Verifique também se `SUPABASE_SERVICE_ROLE_KEY` está configurada
- Acesse: Vercel → Functions → Logs para ver o erro real

### Processamento assíncrono não conclui
- O webhook responde 200 e agenda o trabalho com `after()`, que prolonga a invocação
- A tarefa ainda precisa terminar dentro do limite do plano e da função publicados
- Consulte os logs, reduza o trabalho por mensagem ou mova filas longas para um worker dedicado

---

## Limites da plataforma

Quotas, duração máxima e preços variam por plano e podem mudar. Confirme os
limites vigentes no painel e na documentação da Vercel antes do deploy, com
atenção especial à duração necessária para o processamento assíncrono da IA.
