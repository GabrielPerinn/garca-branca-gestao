'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { resetPassword, type ResetPasswordState } from './actions'

const initialState: ResetPasswordState = { status: 'idle', message: '' }

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(30,113,69,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(213,139,69,0.12),transparent_35%)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 shadow-xl shadow-foreground/5 sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para o login
        </Link>
        <span className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">Criar nova senha</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Escolha uma senha forte e diferente das utilizadas anteriormente.</p>

        {state.message && (
          <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-5">
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-foreground">Nova senha</label>
            <input id="new-password" name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" autoFocus className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
          </div>
          <div>
            <label htmlFor="password-confirmation" className="mb-1.5 block text-sm font-semibold text-foreground">Confirmar nova senha</label>
            <input id="password-confirmation" name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
          </div>
          <div className="rounded-xl bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Mínimo de 12 caracteres, incluindo letra maiúscula, minúscula, número e símbolo.
          </div>
          <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Atualizando...</> : 'Atualizar senha'}
          </button>
        </form>
      </div>
    </main>
  )
}
