'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTask(formData: FormData) {
  const supabase = await createAdminClient()
  const data = {
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    priority: formData.get('priority') as string,
    due_date: formData.get('due_date') as string || null,
  }
  const { error } = await supabase.from('tasks').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}

export async function completeTask(taskId: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}

export async function deleteTask(taskId: string) {
  const supabase = await createAdminClient()
  const { error } = await supabase.from('tasks').update({ status: 'deleted' }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath('/tasks')
  revalidatePath('/')
  return { success: true }
}
