import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import {
  hasPermission,
  permissionLabel,
  type Permission,
} from '@/lib/auth/permissions'

function getRequiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not defined`)
  return value
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export class AuthorizationError extends Error {
  constructor(message = 'Você não tem permissão para realizar esta operação.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export const requireUserContext = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Não autorizado.')
  }

  const serviceClient = createServiceRoleClient()
  const { data: profile, error: profileError } = await serviceClient
    .from('users_profiles')
    .select('id, full_name, role, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_active) {
    throw new Error('Usuário sem perfil ativo.')
  }

  return { user, profile }
})

export async function requireUser() {
  return (await requireUserContext()).user
}

export async function requirePermission(permission: Permission) {
  const context = await requireUserContext()
  if (!hasPermission(context.profile.role, permission)) {
    throw new AuthorizationError(`Seu perfil não pode ${permissionLabel(permission)}.`)
  }
  return context
}

/**
 * Cliente privilegiado para integrações internas verificadas (webhooks/health).
 * Nunca use este cliente como substituto de autenticação em uma Server Action.
 */
export function createServiceRoleClient(options: {
  requestTimeoutMs?: number
  actorProfileId?: string
} = {}) {
  const requestTimeoutMs = options.requestTimeoutMs
  return createSupabaseClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      ...(requestTimeoutMs || options.actorProfileId ? {
        global: {
          ...(options.actorProfileId ? {
            headers: { 'x-actor-profile-id': options.actorProfileId },
          } : {}),
          ...(requestTimeoutMs ? {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
              ...init,
              signal: AbortSignal.timeout(requestTimeoutMs),
            }),
          } : {}),
        },
      } : {}),
    }
  )
}

/**
 * Compatibilidade para páginas/actions existentes: valida a sessão novamente
 * antes de liberar o cliente privilegiado que ignora RLS.
 */
export async function createAdminClient(options: { permission?: Permission } = {}) {
  const { profile } = await requirePermission(options.permission ?? 'read')
  return createServiceRoleClient({ actorProfileId: profile.id })
}
