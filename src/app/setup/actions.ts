'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function setupFarm(formData: FormData) {
  const supabase = await createAdminClient()

  const farmName = formData.get('farm_name') as string
  const location = formData.get('location') as string
  const totalArea = formData.get('total_area') as string
  const notes = formData.get('notes') as string

  const { error } = await supabase.from('farms').insert({
    name: farmName,
    location_description: location || null,
    notes: notes || null,
    status: 'active',
  })

  if (error) throw new Error(error.message)

  redirect('/')
}
