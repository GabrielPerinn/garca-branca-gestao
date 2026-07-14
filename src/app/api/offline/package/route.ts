import { NextResponse } from 'next/server'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { profile } = await requirePermission('operations.write')
    const supabase = createServiceRoleClient({ actorProfileId: profile.id })
    const deviceId = request.headers.get('x-offline-device-id')
    const { data: authorized, error: deviceError } = await supabase.rpc('authorize_offline_device', {
      p_device_id: deviceId,
      p_actor_profile_id: profile.id,
      p_register: true,
      p_display_name: request.headers.get('x-offline-device-name'),
    })
    if (deviceError || !authorized) throw new Error('Não foi possível autorizar este aparelho para o modo offline.')
    const [protocols, lots, pastures, tasks, inventory] = await Promise.all([
      supabase.from('livestock_protocols').select('id, name, next_due_date, recurrence_days, scope_type, cattle_lot_id, land_parcel_id, animal_category').eq('status', 'active').order('next_due_date').limit(500),
      supabase.from('cattle_lots').select('id, name, category, current_quantity, pasture_id').neq('status', 'deleted').order('name').limit(1_000),
      supabase.from('pastures').select('id, name').neq('status', 'deleted').order('name').limit(1_000),
      supabase.from('tasks').select('id, title, due_date, priority').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true, nullsFirst: false }).limit(1_000),
      supabase.from('inventory_items').select('id, name, unit, current_quantity').neq('status', 'deleted').order('name').limit(1_000),
    ])
    const error = protocols.error || lots.error || pastures.error || tasks.error || inventory.error
    if (error) throw new Error(error.message)
    const lotNames = new Map((lots.data ?? []).map(item => [item.id, item.name]))
    const pastureNames = new Map((pastures.data ?? []).map(item => [item.id, item.name]))
    return NextResponse.json({
      version: 2,
      saved_at: new Date().toISOString(),
      protocols: (protocols.data ?? []).map(protocol => ({
        id: protocol.id, name: protocol.name, next_due_date: protocol.next_due_date,
        recurrence_days: protocol.recurrence_days,
        scope_label: protocol.scope_type === 'lot' ? `Lote: ${lotNames.get(protocol.cattle_lot_id ?? '') ?? 'não identificado'}`
          : protocol.scope_type === 'category' ? `Categoria: ${protocol.animal_category ?? 'não informada'}`
            : protocol.scope_type === 'property' ? 'Propriedade' : 'Toda a operação',
      })),
      lots: (lots.data ?? []).map(item => ({ ...item, current_quantity: Number(item.current_quantity ?? 0) })),
      pastures: (pastures.data ?? []).map(item => ({ ...item, name: pastureNames.get(item.id) ?? item.name })),
      tasks: tasks.data ?? [],
      inventory: (inventory.data ?? []).map(item => ({ ...item, current_quantity: Number(item.current_quantity ?? 0) })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'Não foi possível preparar o pacote offline.' }, { status: 401 })
  }
}
