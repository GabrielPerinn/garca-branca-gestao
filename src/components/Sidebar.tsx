'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Bell,
  BrainCircuit,
  Bot,
  ChartNoAxesCombined,
  CheckSquare,
  CreditCard,
  DollarSign,
  FileText,
  Home,
  Inbox,
  LogOut,
  Map,
  Menu,
  MessageSquareText,
  Network,
  Package,
  Settings2,
  Target,
  Tractor,
  Users,
  Wrench,
  ScrollText,
  ShieldPlus,
  X,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { hasPermission } from '@/lib/auth/permissions';

const menuGroups = [
  {
    label: 'Operação',
    items: [
      { name: 'Visão geral', href: '/', icon: Home },
      { name: 'Garça Branca', href: '/ai-chat', icon: MessageSquareText },
      { name: 'Autopiloto', href: '/autopilot', icon: Bot, requiresApproval: true },
      { name: 'Planejamento', href: '/planning', icon: Target, requiresApproval: true },
      { name: 'Inteligência estratégica', href: '/intelligence', icon: BrainCircuit },
      { name: 'Gêmeo digital', href: '/twin', icon: Network },
      { name: 'Ações para revisar', href: '/pending-actions', icon: Bell },
      { name: 'Ocorrências', href: '/occurrences', icon: Inbox },
    ],
  },
  {
    label: 'Pecuária',
    items: [
      { name: 'Rebanho e lotes', href: '/cattle', icon: Tractor },
      { name: 'Sanidade e reprodução', href: '/herd-health', icon: ShieldPlus },
      { name: 'Pesagens', href: '/weighings', icon: Activity },
      { name: 'Vendas do rebanho', href: '/sales', icon: ArrowRightLeft },
      { name: 'Pastos', href: '/pastures', icon: Map },
      { name: 'Operação e propriedades', href: '/farms', icon: Map },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { name: 'Financeiro', href: '/finance', icon: DollarSign },
      { name: 'Contratos rurais', href: '/contracts', icon: ScrollText, requiresApproval: true },
      { name: 'Relatórios', href: '/reports', icon: ChartNoAxesCombined },
      { name: 'Pagamentos', href: '/employee-payments', icon: CreditCard },
    ],
  },
  {
    label: 'Pessoas & Recursos',
    items: [
      { name: 'Funcionários', href: '/employees', icon: Users },
      { name: 'Tarefas', href: '/tasks', icon: CheckSquare },
      { name: 'Estoque', href: '/inventory', icon: Package },
      { name: 'Manutenções', href: '/maintenance', icon: Wrench },
    ],
  },
  {
    label: 'Documentos & Outros',
    items: [
      { name: 'Base da operação', href: '/setup', icon: Settings2, requiresSettings: true },
      { name: 'Documentos', href: '/documents', icon: FileText },
      { name: 'Alertas', href: '/alerts', icon: Bell },
      { name: 'Movimentações', href: '/inventory-movements', icon: Package },
      { name: 'Cascalheira', href: '/gravel-operations', icon: Tractor },
      { name: 'Supressão', href: '/suppression-operations', icon: Tractor },
    ],
  },
];

interface SidebarProps {
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
}

interface NavigationContentProps extends SidebarProps {
  pathname: string;
  idPrefix: string;
  onNavigate?: () => void;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-xs font-bold tracking-wide text-white"
        aria-hidden="true"
      >
        GB
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight text-white">Garça Branca</span>
        <span className="block text-[11px] text-white/45">Gestão da operação</span>
      </div>
    </div>
  );
}

function NavigationContent({ pathname, idPrefix, onNavigate, userEmail, userName, userRole }: NavigationContentProps) {
  return (
    <>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
        {menuGroups.map((group, groupIndex) => {
          const headingId = `${idPrefix}-group-${groupIndex}`;
          return (
            <section key={group.label} aria-labelledby={headingId}>
              <h2
                id={headingId}
                className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35"
              >
                {group.label}
              </h2>
              <div className="space-y-0.5">
                {group.items.filter((item) => {
                  if ('requiresSettings' in item && item.requiresSettings && !hasPermission(userRole, 'settings.write')) return false;
                  if ('requiresApproval' in item && item.requiresApproval && !hasPermission(userRole, 'actions.approve')) return false;
                  return true;
                }).map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 ${
                        active
                          ? 'bg-white/12 text-white shadow-sm'
                          : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-300' : 'text-white/45 group-hover:text-white/75'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.name}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-1 flex items-center gap-3 rounded-xl px-2 py-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {(userName || userEmail || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{userName || 'Administrador'}</p>
            <p className="truncate text-[11px] text-white/40">{userEmail || ''}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white/50 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair do sistema
          </button>
        </form>
      </div>
    </>
  );
}

export function Sidebar({ userEmail, userName, userRole }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const currentPage = useMemo(() => {
    return menuGroups.flatMap((group) => group.items).find((item) => isItemActive(pathname, item.href))?.name;
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-15 items-center justify-between bg-[#162d24] px-4 shadow-md lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-[11px] font-bold text-white" aria-hidden="true">
            GB
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">Garça Branca</p>
            <p className="truncate text-[11px] text-white/45">{currentPage || 'Gestão Rural'}</p>
          </div>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Abrir menu principal"
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <aside className="hidden h-dvh w-[248px] shrink-0 flex-col bg-[#162d24] shadow-[4px_0_18px_rgba(18,37,29,0.08)] lg:flex" aria-label="Barra lateral">
        <div className="border-b border-white/10 px-5 py-4">
          <Brand />
        </div>
        <NavigationContent
          pathname={pathname}
          idPrefix="desktop-navigation"
          userEmail={userEmail}
          userName={userName}
          userRole={userRole}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu principal"
          />
          <aside
            id="mobile-sidebar"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            tabIndex={-1}
            className="relative flex h-dvh w-[min(19rem,calc(100vw-2.5rem))] flex-col bg-[#162d24] shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
              <Brand />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/55 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Fechar menu principal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavigationContent
              pathname={pathname}
              idPrefix="mobile-navigation"
              onNavigate={() => setMobileOpen(false)}
              userEmail={userEmail}
              userName={userName}
              userRole={userRole}
            />
          </aside>
        </div>
      )}
    </>
  );
}
