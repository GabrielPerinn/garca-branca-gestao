'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createMaintenanceRecord(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    asset_name: formData.get('asset_name') as string,
    asset_type: 'equipment',
    maintenance_type: formData.get('maintenance_type') as string || null,
    maintenance_date: formData.get('maintenance_date') as string || null,
    cost_amount: formData.get('cost_amount') ? parseFloat(formData.get('cost_amount') as string) : null,
    responsible_person: formData.get('responsible_person') as string || null,
    notes: formData.get('notes') as string || null,
    status: 'active',
  }
  const { error } = await supabase.from('maintenance_records').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/maintenance')
  return { success: true }
}

export async function deleteMaintenanceRecord(id: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('maintenance_records').update({ status: 'deleted' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/maintenance')
  return { success: true }
}
