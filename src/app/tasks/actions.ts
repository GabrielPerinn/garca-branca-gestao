'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { softDeleteRecord, updateRecordState } from '@/lib/data/mutations'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { optionalDateString, optionalText, parseFormData, parseRecordId, requiredText } from '@/lib/validation/forms'
import { getPrimaryFarmId } from '@/lib/data/farms'

const taskSchema = z.object({
  title: requiredText('Título'),
  description: optionalText('Descrição'),
  priority: z.enum(['low', 'medium', 'high'], { error: 'Prioridade inválida.' }),
  due_date: optionalDateString('Prazo'),
})

export async function createTask(formData: FormData) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const input = parseFormData(taskSchema, formData)
  const farmId = await getPrimaryFarmId(supabase)
  const data = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    due_date: input.due_date ?? null,
    status: 'pending',
    related_farm_id: farmId,
  }
  const { error } = await supabase.from('tasks').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}

export async function completeTask(taskId: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(taskId)
  await updateRecordState(supabase, {
    table: 'tasks',
    id: recordId,
    fromStatus: 'pending',
    values: { status: 'completed', completed_at: new Date().toISOString() },
    label: 'Tarefa',
  })
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}

export async function deleteTask(taskId: string) {
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const recordId = parseRecordId(taskId)
  await softDeleteRecord(supabase, 'tasks', recordId, 'Tarefa')
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}
