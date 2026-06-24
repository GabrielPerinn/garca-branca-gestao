interface StatusBadgeProps {
  status: string;
  map?: Record<string, { label: string; className: string }>;
}

const DEFAULT_MAP: Record<string, { label: string; className: string }> = {
  active:         { label: 'Ativo',       className: 'bg-green-500/15 text-green-500 border-green-500/30' },
  pending:        { label: 'Pendente',    className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  pending_review: { label: 'Revisão',     className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  completed:      { label: 'Concluído',   className: 'bg-green-500/15 text-green-500 border-green-500/30' },
  converted:      { label: 'Convertido',  className: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  archived:       { label: 'Arquivado',   className: 'bg-muted text-muted-foreground border-border' },
  deleted:        { label: 'Excluído',    className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  high:           { label: 'Alta',        className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  medium:         { label: 'Média',       className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  low:            { label: 'Baixa',       className: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  discarded:      { label: 'Descartado',  className: 'bg-muted text-muted-foreground border-border' },
};

export function StatusBadge({ status, map }: StatusBadgeProps) {
  const lookup = { ...DEFAULT_MAP, ...map };
  const config = lookup[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}
