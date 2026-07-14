import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/privacy',
  '/robots.txt',
  '/api/health',
  '/api/webhook/whatsapp',
])

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => (
    name.startsWith('sb-')
      && name.includes('-auth-token')
      && !name.includes('code-verifier')
  ))
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Integrações externas e o health check não possuem cookie de usuário.
  if (
    pathname === '/api/health'
    || pathname === '/api/webhook/whatsapp'
    || pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next()
  }

  // O callback precisa trocar o código PKCE antes de qualquer verificação de sessão.
  if (pathname === '/auth/callback') return NextResponse.next()

  // Rotas públicas sem sessão devem abrir mesmo se o provedor estiver indisponível.
  if (PUBLIC_ROUTES.has(pathname) && !hasSessionCookie(request)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (PUBLIC_ROUTES.has(pathname)) return supabaseResponse
    return NextResponse.json({ error: 'Serviço indisponível' }, { status: 503 })
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  function redirectTo(pathname: string, errorCode?: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = errorCode ? `?error=${encodeURIComponent(errorCode)}` : ''
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  if (!user && !PUBLIC_ROUTES.has(pathname)) {
    return redirectTo('/login', 'session')
  }

  if (user && (pathname === '/login' || pathname === '/forgot-password')) {
    return redirectTo('/')
  }

  return supabaseResponse
}
