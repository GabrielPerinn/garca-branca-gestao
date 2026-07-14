'use client';

import { Suspense } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { login } from './actions';

const errorMessages: Record<string, string> = {
  invalid: 'Preencha um e-mail válido e informe sua senha.',
  credentials: 'E-mail ou senha incorretos. Verifique suas credenciais.',
  session: 'Sua sessão expirou. Entre novamente para continuar.',
  inactive: 'Seu acesso ainda não foi liberado ou foi desativado. Fale com o administrador.',
  service: 'O serviço de autenticação está temporariamente indisponível. Tente novamente em alguns instantes.',
  'recovery-link': 'O link de recuperação é inválido ou expirou. Solicite um novo link.',
};

const successMessages: Record<string, string> = {
  'password-reset': 'Senha atualizada com sucesso. Entre novamente com sua nova senha.',
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Entrando...</>
      ) : (
        <>Entrar no sistema <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></>
      )}
    </button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error') || '';
  const errorMessage = errorMessages[errorCode];
  const successCode = searchParams.get('success') || '';
  const successMessage = successMessages[successCode];

  return (
    <main className="grid min-h-dvh bg-card lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)]">
      <section className="relative hidden overflow-hidden bg-[#162d24] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-xs font-bold tracking-wide">GB</span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Garça Branca</p>
            <p className="text-[11px] text-white/45">Gestão da operação rural</p>
          </div>
        </div>

        <div className="relative max-w-lg py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Plataforma de gestão</p>
          <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.04em] xl:text-[3.15rem]">
            Informação confiável para conduzir a operação.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/55">
            Controle financeiro, rebanho, equipe e atividades de campo em um ambiente único, rastreável e seguro.
          </p>

          <div className="mt-9 space-y-3 border-t border-white/10 pt-6 text-sm text-white/65">
            {['Indicadores consolidados da fazenda', 'Histórico de alterações e aprovações', 'Acesso restrito por usuário'].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-white/35">
          <span>Ambiente privado</span><span>Garça Branca</span>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center border-l border-border bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#162d24] text-xs font-bold text-white">GB</span>
              <div>
                <p className="font-bold tracking-tight text-foreground">Garça Branca</p>
                <p className="text-xs text-muted-foreground">Gestão da operação rural</p>
              </div>
            </div>
          </div>

          <div className="mb-7">
            <span className="app-kicker">Acesso ao sistema</span>
            <h2 className="mt-2 text-[2rem] font-semibold tracking-[-0.035em] text-foreground">Entrar na operação</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Utilize as credenciais fornecidas pelo administrador.</p>
          </div>

          {errorMessage && (
            <div role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
              <p className="font-semibold">Não foi possível entrar</p>
              <p className="mt-0.5 text-destructive/85">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-5 flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          )}

          <form action={login} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-foreground">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="seuemail@exemplo.com"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="password" className="block text-sm font-semibold text-foreground">Senha</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Digite sua senha"
              />
            </div>

            <SubmitButton />
          </form>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Ambiente seguro e acesso restrito
            </span>
            <span aria-hidden="true">•</span>
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              Política de Privacidade
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
