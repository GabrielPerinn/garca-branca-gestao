'use client'

import { useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  label?: string;
}

export function ConfirmDeleteButton({ onConfirm, label = 'Excluir' }: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => { onConfirm(); setConfirming(false); }}
          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Confirmar
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
      title={label}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
