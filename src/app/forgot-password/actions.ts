'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type PasswordRecoveryState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const emailSchema = z.string().trim().email()

function getAppBaseUrl() {
  const configured = process.env.APP_BASE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    ?? (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined)

  if (!configured) return null

  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

export async function requestPasswordRecovery(
  _previousState: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) {
    return { status: 'error', message: 'Informe um endereço de e-mail válido.' }
  }

  const appBaseUrl = getAppBaseUrl()
  if (!appBaseUrl) {
    return { status: 'error', message: 'A recuperação de senha ainda não foi configurada neste ambiente.' }
  }

  const callbackUrl = new URL('/auth/callback', appBaseUrl)
  callbackUrl.searchParams.set('next', '/reset-password')

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: callbackUrl.toString(),
    })

    if (error) {
      console.error('[Auth] Falha ao solicitar recuperação:', error.name)
      return { status: 'error', message: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns instantes.' }
    }
  } catch (error) {
    console.error('[Auth] Serviço de recuperação indisponível:', error instanceof Error ? error.name : 'unknown')
    return { status: 'error', message: 'O serviço de autenticação está temporariamente indisponível.' }
  }

  // Mensagem neutra para não revelar se o endereço está cadastrado.
  return {
    status: 'success',
    message: 'Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.',
  }
}
