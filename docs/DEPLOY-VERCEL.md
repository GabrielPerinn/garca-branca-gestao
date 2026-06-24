# Guia de Deploy (Vercel + Supabase)

Este documento orienta a publicação do sistema Garça Branca Gestão Rural em ambiente de **Staging / Produção**.

## 1. Subindo o Código para o GitHub
Para que a Vercel faça o deploy automático, seu código precisa estar no GitHub.
1. Crie um repositório privado no GitHub.
2. No seu terminal local:
   ```bash
   git add .
   git commit -m "Preparando sistema para publicação (Etapa 10)"
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
- `AI_PROVIDER`: Defina como `openai` na Vercel (se estiver `mock` ele usará dados falsos).

## 4. Segurança e Validação Pós-Deploy
Após o primeiro deploy terminar:
1. Acesse a URL gerada (ex: `https://garca-branca.vercel.app`).
2. Acesse a rota `/ai-test`.
3. Certifique-se de que o sistema consegue gravar uma ocorrência falsa (teste a conexão com o Supabase de produção/staging).
4. **Nota sobre Segurança**: Até a Etapa 11 (Autenticação), as páginas de Client não farão gravações porque o banco está selado por RLS. Apenas a IA (que roda no Server e usa a Service Role Key) conseguirá operar os dados.
