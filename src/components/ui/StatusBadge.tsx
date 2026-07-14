interface StatusBadgeProps {
  status: string;
  map?: Record<string, { label: string; className: string }>;
}

const DEFAULT_MAP: Record<string, { label: string; className: string }> = {
  active:         { label: 'Ativo',       className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pending:        { label: 'Pendente',    className: 'bg-amber-50 text-amber-900 border-amber-200' },
  pending_review: { label: 'Revisão',     className: 'bg-amber-50 text-amber-900 border-amber-200' },
  completed:      { label: 'Concluído',   className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  converted:      { label: 'Convertido',  className: 'bg-blue-50 text-blue-800 border-blue-200' },
  archived:       { label: 'Arquivado',   className: 'bg-muted text-muted-foreground border-border' },
  deleted:        { label: 'Excluído',    className: 'bg-red-50 text-red-800 border-red-200' },
  high:           { label: 'Alta',        className: 'bg-red-50 text-red-800 border-red-200' },
  medium:         { label: 'Média',       className: 'bg-amber-50 text-amber-900 border-amber-200' },
  low:            { label: 'Baixa',       className: 'bg-blue-50 text-blue-800 border-blue-200' },
  discarded:      { label: 'Descartado',  className: 'bg-muted text-muted-foreground border-border' },
  overdue:        { label: 'Vencido',      className: 'bg-red-50 text-red-800 border-red-200' },
  paused:         { label: 'Pausado',      className: 'bg-muted text-muted-foreground border-border' },
  partial:        { label: 'Parcial',       className: 'bg-amber-50 text-amber-900 border-amber-200' },
  skipped:        { label: 'Não realizado', className: 'bg-muted text-muted-foreground border-border' },
};

export function StatusBadge({ status, map }: StatusBadgeProps) {
  const lookup = { ...DEFAULT_MAP, ...map };
  const config = lookup[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
