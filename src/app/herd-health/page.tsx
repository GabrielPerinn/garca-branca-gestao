import { createAdminClient } from '@/lib/supabase/server'
import { HerdHealthClientPage } from './client-page'
import { getCivilDate, shiftCivilDate } from '@/lib/date'

export const dynamic = 'force-dynamic'

export default async function HerdHealthPage() {
  const supabase = await createAdminClient()
  const [protocols, executions, lots, properties, employees] = await Promise.all([
    supabase.from('livestock_protocols').select('*').neq('status', 'deleted').order('next_due_date'),
    supabase.from('livestock_protocol_executions').select('*').order('executed_on', { ascending: false }).limit(200),
    supabase.from('cattle_lots').select('id, name, category, current_quantity').neq('status', 'deleted').order('name'),
    supabase.from('land_parcels').select('id, name').neq('status', 'deleted').order('name'),
    supabase.from('employees').select('id, full_name').neq('status', 'deleted').order('full_name'),
  ])
  return <HerdHealthClientPage
    protocols={protocols.data || []}
    executions={executions.data || []}
    lots={lots.data || []}
    properties={properties.data || []}
    employees={employees.data || []}
    today={getCivilDate()}
    nextThirtyDays={shiftCivilDate(getCivilDate(), 30)}
    dbError={protocols.error?.message || executions.error?.message || lots.error?.message || properties.error?.message || employees.error?.message}
  />
}
