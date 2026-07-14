'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
})

function isServiceUnavailable(error: { message?: string; name?: string; status?: number } | null) {
  if (!error) return false
  return Boolean(
    (error.status && error.status >= 500)
      || error.name?.toLowerCase().includes('retryable')
      || error.message?.toLowerCase().includes('fetch failed')
  )
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) redirect('/login?error=invalid')

  let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>
  try {
    result = await supabase.auth.signInWithPassword(parsed.data)
  } catch {
    redirect('/login?error=service')
  }

  const { data, error } = result

  if (error || !data.user) {
    if (isServiceUnavailable(error)) redirect('/login?error=service')
    redirect('/login?error=credentials')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users_profiles')
    .select('is_active')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (profileError || !profile?.is_active) {
    await supabase.auth.signOut()
    redirect('/login?error=inactive')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
