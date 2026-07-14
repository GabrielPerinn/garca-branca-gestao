import Link from 'next/link'
import { Laptop, ShieldCheck, ShieldX } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatters'
import { updateOfflineDeviceStatus } from './actions'

export const dynamic = 'force-dynamic'

export default async function OfflineDevicesPage() {
  const supabase = await createAdminClient({ permission: 'settings.write' })
  const { data: devices, error } = await supabase.from('offline_devices').select('*').order('last_seen_at', { ascending: false })
  return <div className="app-page max-w-4xl">
    <header className="border-b border-border pb-5"><p className="app-kicker">Segurança offline</p><h1 className="text-[1.75rem] font-semibold tracking-tight">Aparelhos autorizados</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Somente aparelhos ativos podem baixar o pacote de campo ou sincronizar registros. Revogar interrompe novos envios imediatamente.</p></header>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error.message}</div>}
    <section className="app-panel mt-5 overflow-hidden">{!devices?.length ? <div className="p-8 text-center"><Laptop className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Nenhum aparelho preparado</p><p className="mt-1 text-xs text-muted-foreground">Abra o Diário offline em um aparelho conectado para autorizá-lo.</p></div> : <div className="divide-y divide-border">{devices.map(device => {
      const active = device.status === 'active'
      const action = updateOfflineDeviceStatus.bind(null, device.device_id, active ? 'revoked' : 'active')
      return <article key={device.device_id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{active ? <ShieldCheck className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{device.display_name || 'Aparelho de campo'}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{active ? 'Ativo' : 'Revogado'}</span></div><p className="mt-1 font-mono text-[11px] text-muted-foreground">{device.device_id}</p><p className="mt-1 text-xs text-muted-foreground">Último contato: {formatDateTime(device.last_seen_at)}</p></div><form action={action}><button type="submit" className={active ? 'app-button-secondary text-red-700' : 'app-button-secondary'}>{active ? 'Revogar aparelho' : 'Reautorizar'}</button></form></article>
    })}</div>}</section>
    <Link href="/offline" className="app-button-secondary mt-5">Voltar ao Diário offline</Link>
  </div>
}
