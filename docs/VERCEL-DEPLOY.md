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
5. Clique em **"Deploy"** (vai falhar por falta de env vars — é esperado)

---

## Passo 3 — Configurar variáveis de ambiente

No painel da Vercel: **Project Settings** → **Environment Variables**

### Variáveis PÚBLICAS (podem aparecer no browser)
| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ipkdcyihalrmwzukeqai.supabase.co` |
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
| `OPENAI_API_KEY` | Chave da OpenAI (opcional, usa mock sem ela) |

### Variáveis opcionais
| Nome | Valor exemplo | Descrição |
|---|---|---|
| `AI_PROVIDER` | `openai` ou vazio | Deixar vazio usa Mock |
| `APP_BASE_URL` | `https://seu-app.vercel.app` | URL pública do sistema |

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
  "checks": {
    "env": { "ok": true },
    "database": { "ok": true, "latency_ms": 120 },
    "whatsapp": { "ok": true },
    "openai": { "ok": true }
  }
}
```

---

## Passo 6 — Testar o webhook publicado

```bash
# Edite APP_BASE_URL no .env.local
echo "APP_BASE_URL=https://seu-app.vercel.app" >> .env.local

# Rode o smoke test
npm run smoke:webhook
```

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

## Script de deploy completo

Adicione ao `package.json`:
```json
{
  "scripts": {
    "deploy": "vercel --prod",
    "deploy:preview": "vercel"
  }
}
```

---

## Troubleshooting

### Build falha com "Cannot find module"
```bash
# Limpe o cache local e rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Variável de ambiente não encontrada em produção
- Verifique se está marcada para ambiente **Production** na Vercel
- Faça redeploy após adicionar
- `NEXT_PUBLIC_*` variáveis ficam no bundle do browser — as outras só no servidor

### Webhook retornando 500
- Verifique se `SUPABASE_SERVICE_ROLE_KEY` está configurada
- Acesse: Vercel → Functions → Logs para ver o erro real

### Timeout na Vercel (10s no plano Hobby)
- O webhook responde 200 imediatamente (antes de processar)
- O processamento assíncrono pode ser cortado no plano Hobby
- Solução: plano Pro (60s) ou usar Supabase Edge Functions para o processamento

---

## Limites do plano gratuito Vercel (Hobby)

| Recurso | Limite |
|---|---|
| Deploys/mês | 100 |
| Bandwidth | 100 GB |
| Function timeout | 10s |
| Function memory | 1024 MB |
| Serverless invocations | 100.000/mês |

> Para uso em produção real, considere o **plano Pro** (US$ 20/mês) que tem timeout de 60s, mais importante para processamento da IA.
