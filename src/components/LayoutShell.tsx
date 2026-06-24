import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { Sidebar } from './Sidebar'

export async function LayoutShell({ children }: { children: React.ReactNode }) {
  // Determine if we're on the login page
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  
  // Get user to show in sidebar
  let userEmail: string | null = null
  let userName: string | null = null
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userEmail = user.email || null
      userName = user.user_metadata?.full_name || user.email?.split('@')[0] || null
    }
  } catch {}

  const isLoginPage = !userEmail
  
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={userEmail} userName={userName} />
      <main className="flex-1 h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
