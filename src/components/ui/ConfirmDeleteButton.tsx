'use client'

import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  label?: string;
  confirmLabel?: string;
}

export function ConfirmDeleteButton({
  onConfirm,
  label = 'Excluir',
  confirmLabel = 'Confirmar exclusão',
}: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível excluir o registro.');
    } finally {
      setPending(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label={`${label}: confirmar ação`}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white outline-none transition-colors hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {pending ? 'Excluindo...' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={pending}
            className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
        {error && (
          <p className="max-w-56 text-right text-xs font-medium text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setConfirming(true);
        setError(null);
      }}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
      aria-label={label}
      title={label}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
