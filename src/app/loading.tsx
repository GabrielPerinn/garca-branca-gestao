import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return (
    <main
      className="min-h-[70vh] w-full p-6 sm:p-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center gap-3 text-primary" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm font-medium">Atualizando dados da fazenda...</span>
        </div>

        <div className="space-y-3">
          <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="mb-5 h-4 w-28 rounded bg-muted" />
              <div className="h-8 w-20 rounded bg-muted/80" />
            </div>
          ))}
        </div>

        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card shadow-sm" />
      </div>
    </main>
  );
}
