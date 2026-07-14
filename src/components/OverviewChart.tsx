'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyPoint } from '@/app/DashboardClient';

const compactCurrency = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function OverviewChart({ data }: { data: MonthlyPoint[] }) {
  const hasMovement = data.some((point) => point.receita !== 0 || point.despesa !== 0);

  if (!hasMovement) {
    return (
      <div className="flex h-[270px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
        <p className="text-sm font-semibold text-foreground">Sem movimentação financeira no período</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          O gráfico será preenchido conforme receitas e despesas forem registradas.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[270px] w-full" role="img" aria-label="Gráfico comparando receitas, despesas e saldo do período">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="month"
            stroke="var(--color-muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dy={8}
          />
          <YAxis
            width={72}
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => compactCurrency.format(value)}
          />
          <Tooltip
            formatter={(value, name) => [fullCurrency.format(Number(value || 0)), name]}
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              borderRadius: '6px',
              boxShadow: '0 8px 24px rgba(32, 47, 40, 0.10)',
              color: 'var(--color-foreground)',
            }}
            labelStyle={{ color: 'var(--color-foreground)', fontWeight: 700 }}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={36}
            iconType="square"
            wrapperStyle={{ fontSize: '12px', color: 'var(--color-muted-foreground)' }}
          />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeOpacity={0.35} />
          <Bar name="Receitas" dataKey="receita" fill="#2f7454" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar name="Despesas" dataKey="despesa" fill="#c98b78" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Line
            type="monotone"
            name="Saldo"
            dataKey="saldo"
            stroke="#223b2f"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#223b2f', strokeWidth: 2, stroke: '#ffffff' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <table className="sr-only">
        <caption>Receitas, despesas e saldo do período</caption>
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr></thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.month}>
              <td>{point.month}</td>
              <td>{fullCurrency.format(point.receita)}</td>
              <td>{fullCurrency.format(point.despesa)}</td>
              <td>{fullCurrency.format(point.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
