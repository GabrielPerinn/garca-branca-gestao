'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, Tractor, Users, DollarSign, Package, CheckSquare, Bot, ArrowRightLeft, Activity, Bell, FileText, Wrench, LogOut, Inbox, CreditCard } from 'lucide-react';
import { logout } from '@/app/login/actions';

const menuGroups = [
  {
    label: 'IA & Operações',
    items: [
      { name: 'Dashboard', href: '/', icon: Home },
      { name: 'Simulador IA', href: '/ai-test', icon: Bot },
      { name: 'Ações Pendentes', href: '/pending-actions', icon: Bell },
      { name: 'Caixa de Entrada', href: '/occurrences', icon: Inbox },
    ]
  },
  {
    label: 'Pecuária',
    items: [
      { name: 'Gado / Lotes', href: '/cattle', icon: Tractor },
      { name: 'Pesagens', href: '/weighings', icon: Activity },
      { name: 'Vendas de Gado', href: '/sales', icon: ArrowRightLeft },
      { name: 'Pastos', href: '/pastures', icon: Map },
      { name: 'Fazendas', href: '/farms', icon: Map },
    ]
  },
  {
    label: 'Financeiro',
    items: [
      { name: 'Financeiro', href: '/finance', icon: DollarSign },
      { name: 'Pagamentos', href: '/employee-payments', icon: CreditCard },
    ]
  },
  {
    label: 'Pessoas & Recursos',
    items: [
      { name: 'Funcionários', href: '/employees', icon: Users },
      { name: 'Tarefas', href: '/tasks', icon: CheckSquare },
      { name: 'Estoque', href: '/inventory', icon: Package },
      { name: 'Manutenções', href: '/maintenance', icon: Wrench },
    ]
  },
  {
    label: 'Documentos & Outros',
    items: [
      { name: 'Documentos', href: '/documents', icon: FileText },
      { name: 'Alertas', href: '/alerts', icon: Bell },
      { name: 'Mov. Estoque', href: '/inventory-movements', icon: Package },
      { name: 'Cascalheira', href: '/gravel-operations', icon: Tractor },
      { name: 'Supressão', href: '/suppression-operations', icon: Tractor },
    ]
  },
];

interface SidebarProps {
  userEmail: string | null;
  userName: string | null;
}

export function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col bg-card border-r border-border shadow-sm flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-lg shadow-primary/30 flex-shrink-0">
          GB
        </div>
        <div className="min-w-0">
          <span className="text-base font-bold tracking-tight text-foreground block truncate">Garça Branca</span>
          <span className="text-xs text-muted-foreground">Gestão Rural</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-5 px-3">
        {menuGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary' : ''}`} />
                    <span className="truncate">{item.name}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl mb-1">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {(userName || userEmail || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{userName || 'Administrador'}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail || ''}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair do sistema
          </button>
        </form>
      </div>
    </div>
  );
}
