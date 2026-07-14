'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { requestPasswordRecovery, type PasswordRecoveryState } from './actions'

const initialState: PasswordRecoveryState = { status: 'idle', message: '' }

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordRecovery, initialState)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(30,113,69,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(213,139,69,0.12),transparent_35%)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 shadow-xl shadow-foreground/5 sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para o login
        </Link>

        <span className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">Recuperar acesso</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Informe seu e-mail. Se houver uma conta vinculada, enviaremos um link seguro para redefinir a senha.
        </p>

        {state.message && (
          <div
            role={state.status === 'error' ? 'alert' : 'status'}
            className={`mt-6 flex gap-3 rounded-xl border px-4 py-3 text-sm ${state.status === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-destructive/25 bg-destructive/[0.06] text-destructive'}`}
          >
            {state.status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <p>{state.message}</p>
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-5">
          <div>
            <label htmlFor="recovery-email" className="mb-1.5 block text-sm font-semibold text-foreground">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="recovery-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                placeholder="seuemail@exemplo.com"
              />
            </div>
          </div>
          <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Enviando...</> : 'Enviar link de recuperação'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Por segurança, o link expira e só pode ser utilizado para a conta solicitada.
        </p>
      </div>
    </main>
  )
}
