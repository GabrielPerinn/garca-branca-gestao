# Guia de Deploy (Vercel + Supabase)

Este documento orienta a publicação do sistema Garça Branca Gestão Rural em ambiente de **Staging / Produção**.

## 1. Subindo o Código para o GitHub
Para que a Vercel faça o deploy automático, seu código precisa estar no GitHub.
1. Crie um repositório privado no GitHub.
2. No seu terminal local:
   ```bash
   git add .
   git commit -m "chore: preparar deploy de staging"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/garca-branca-gestao.git
   git push -u origin main
   ```

## 2. Conectando na Vercel
1. Acesse [vercel.com](https://vercel.com) e clique em **Add New Project**.
2. Importe o repositório do GitHub recém-criado.
3. A Vercel detectará automaticamente que é um projeto Next.js. Não altere os comandos de Build (`npm run build`).

## 3. Variáveis de Ambiente (CRÍTICO)
> [!WARNING]  
> Você NUNCA deve comitar o arquivo `.env.local` no GitHub. Ele já está no `.gitignore`.  
> Você precisará copiar as chaves e colar diretamente no painel da Vercel durante a importação.

### Variáveis Públicas (Acessíveis pelo Frontend do Cliente)
Estas variáveis ficam visíveis no código fonte do navegador e **só devem conter chaves públicas**.
- `NEXT_PUBLIC_SUPABASE_URL`: A URL do seu banco Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: A chave anônima (com RLS ativado, ela é segura).

### Variáveis Secretas (Acessíveis Apenas pelo Backend/Servidor Vercel)
Estas chaves têm poder de destruir a fazenda ou gastar seu dinheiro. **Nunca** coloque `NEXT_PUBLIC_` na frente delas.
- `SUPABASE_SERVICE_ROLE_KEY`: A chave mestra que ultrapassa o RLS.
- `OPENAI_API_KEY`: A chave da OpenAI para o Cérebro IA.
- `WHATSAPP_VERIFY_TOKEN`: Token privado usado no handshake do webhook.
- `WHATSAPP_APP_SECRET`: Segredo usado para validar a assinatura HMAC da Meta.
- `WHATSAPP_ACCESS_TOKEN`: Token de envio de respostas do WhatsApp.
- `WHATSAPP_PHONE_NUMBER_ID`: Identificador do número remetente configurado na Meta.
- `WHATSAPP_ALLOWED_PHONES`: Allowlist opcional de remetentes autorizados.
- `APP_BASE_URL`: URL HTTPS pública usada pelo health check e pelas integrações.

No painel do Supabase, em **Authentication → URL Configuration**, configure a
URL pública do aplicativo como Site URL e inclua
`https://seu-dominio/auth/callback` nas Redirect URLs. Esse endereço é usado
pelo fluxo seguro de recuperação de senha.
- `AI_PROVIDER`: Use `openai` ou `mock`; com chave configurada, vazio usa OpenAI.
- `OPENAI_MODEL`: Modelo de interpretação estruturada; padrão `gpt-5.6`.

## 4. Segurança e Validação Pós-Deploy
Após o primeiro deploy terminar:
1. Acesse a URL gerada (ex: `https://garca-branca.vercel.app`).
2. Entre com um usuário autenticado que possua um perfil ativo em `users_profiles`.
3. Valide `/api/health`; o resultado saudável é HTTP 200 com
   `checks.configuration.ok` e `checks.database.ok` iguais a `true`.
4. Use `/ai-test` somente em staging: essa rota grava ocorrências ou ações pendentes.
5. **Modelo de segurança atual**: páginas protegidas exigem sessão e perfil ativo;
   Server Actions repetem autorização no servidor; RLS continua como camada do
   banco. A service role é usada apenas em código de servidor e nunca substitui
   essas verificações nas ações iniciadas pelo usuário.
