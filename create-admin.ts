import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Using the service_role key to bypass email confirmation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createAdmin() {
  console.log("Criando usuário admin...");
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@garcabranca.com',
    password: 'garcabranca123!',
    email_confirm: true
  });
  
  if (error) {
    if (error.message.includes('already exists')) {
       console.log("Usuário admin@garcabranca.com já existe! Senha deve ser a que foi cadastrada.");
    } else {
       console.error("Erro:", error);
    }
  } else {
    console.log("Sucesso! E-mail: admin@garcabranca.com | Senha: garcabranca123!");
  }
}

createAdmin();
