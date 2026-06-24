"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export function OverviewChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
        <XAxis
          dataKey="name"
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `R$${value / 1000}k`}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
          itemStyle={{ color: '#f8fafc' }}
        />
        <Line
          type="monotone"
          name="Receitas"
          dataKey="receita"
          stroke="#10b981"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 6, fill: '#10b981' }}
        />
        <Line
          type="monotone"
          name="Despesas"
          dataKey="despesa"
          stroke="#ef4444"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 6, fill: '#ef4444' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
