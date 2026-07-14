import { requireUserContext } from '@/lib/supabase/server'
import { Sidebar } from './Sidebar'
import { OfflineRuntime } from './OfflineRuntime'

export async function LayoutShell({ children }: { children: React.ReactNode }) {
  let isAuthenticated = false
  let userEmail: string | null = null
  let userName: string | null = null
  let userRole: string | null = null
  
  try {
    const { user, profile } = await requireUserContext()
    isAuthenticated = true
    userEmail = user.email || null
    userName = profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || null
    userRole = profile.role
  } catch {}

  if (!isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-[200%] rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-xl transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Pular para o conteúdo principal
      </a>
      <Sidebar userEmail={userEmail} userName={userName} userRole={userRole} />
      <OfflineRuntime />
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh min-w-0 flex-1 pt-15 outline-none lg:h-dvh lg:overflow-y-auto lg:pt-0"
      >
        {children}
      </main>
    </div>
  )
}
