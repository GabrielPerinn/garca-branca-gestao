'use client';

import Link from 'next/link';
import { AlertTriangle, House, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    console.error('Erro não tratado na interface:', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>

        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-destructive">
          Falha inesperada
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Não foi possível carregar esta área
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Seus dados não foram apagados. Tente novamente e, se o problema continuar,
          informe o código de referência ao suporte.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            Referência: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <House className="h-4 w-4" aria-hidden="true" />
            Voltar ao painel
          </Link>
        </div>
      </section>
    </main>
  );
}
