'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, requirePermission } from '@/lib/supabase/server'
import { parseRecordId } from '@/lib/validation/forms'

export async function updateOfflineDeviceStatus(deviceId: string, status: 'active' | 'revoked') {
  const { profile } = await requirePermission('settings.write')
  const supabase = await createAdminClient({ permission: 'settings.write' })
  const id = parseRecordId(deviceId)
  const values = status === 'revoked'
    ? { status, revoked_at: new Date().toISOString(), revoked_by: profile.id }
    : { status, revoked_at: null, revoked_by: null }
  const { error } = await supabase.from('offline_devices').update(values).eq('device_id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/offline/devices')
}
