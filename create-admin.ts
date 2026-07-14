import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`A variável ${name} é obrigatória.`);
  }

  return value;
}

async function createAdmin() {
  const supabaseUrl = requireEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL').trim();
  const serviceRoleKey = requireEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY').trim();
  const adminEmail = requireEnvironmentVariable('ADMIN_EMAIL').trim();
  const adminPassword = requireEnvironmentVariable('ADMIN_PASSWORD');
  const adminName = process.env.ADMIN_NAME?.trim() || 'Administrador';

  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
    throw new Error('ADMIN_EMAIL deve conter um endereço de e-mail válido.');
  }

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('Criando usuário administrador...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { full_name: adminName },
  });

  let userId = data.user?.id;
  let existingUser = false;

  if (error) {
    const normalizedMessage = error.message.toLowerCase();
    if (normalizedMessage.includes('already') || normalizedMessage.includes('registered') || normalizedMessage.includes('existe')) {
      console.log(`O usuário administrador ${adminEmail} já existe.`);
      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1_000 });
      if (listError) throw new Error(`Não foi possível localizar o administrador existente: ${listError.message}`);
      userId = usersData.users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase())?.id;
      existingUser = true;
    } else {
      throw new Error(`Não foi possível criar o administrador: ${error.message}`);
    }
  }

  if (!userId) throw new Error('Não foi possível determinar o ID do administrador.');

  if (existingUser) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    });
    if (updateError) throw new Error(`Não foi possível atualizar a credencial do administrador: ${updateError.message}`);
  }

  const { error: profileError } = await supabase.from('users_profiles').upsert({
    user_id: userId,
    full_name: adminName,
    role: 'admin',
    is_active: true,
  }, { onConflict: 'user_id' });

  if (profileError) throw new Error(`Administrador criado, mas o perfil não pôde ser configurado: ${profileError.message}`);

  console.log(`Administrador e perfil configurados com sucesso: ${adminEmail}.`);
}

createAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  console.error(`Falha ao criar administrador: ${message}`);
  process.exitCode = 1;
});
