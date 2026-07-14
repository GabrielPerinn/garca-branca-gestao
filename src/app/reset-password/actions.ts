'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type ResetPasswordState = {
  status: 'idle' | 'error'
  message: string
}

const passwordSchema = z.object({
  password: z.string()
    .min(12)
    .max(256)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
  confirmation: z.string(),
}).refine((data) => data.password === data.confirmation, { path: ['confirmation'] })

export async function resetPassword(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get('password'),
    confirmation: formData.get('confirmation'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Use ao menos 12 caracteres com maiúscula, minúscula, número e símbolo; as senhas devem ser iguais.',
    }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { status: 'error', message: 'Este link expirou ou já foi utilizado. Solicite uma nova recuperação.' }
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) {
      console.error('[Auth] Falha ao atualizar senha:', error.name)
      return { status: 'error', message: 'Não foi possível atualizar a senha. Solicite um novo link e tente novamente.' }
    }

    await supabase.auth.signOut()
  } catch (error) {
    console.error('[Auth] Serviço de redefinição indisponível:', error instanceof Error ? error.name : 'unknown')
    return { status: 'error', message: 'O serviço de autenticação está temporariamente indisponível.' }
  }

  redirect('/login?success=password-reset')
}
