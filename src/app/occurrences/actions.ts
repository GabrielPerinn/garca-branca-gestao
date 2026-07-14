'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { updateRecordState } from '@/lib/data/mutations'
import { dateString, optionalDateString, parseRecordId } from '@/lib/validation/forms'

const targetSchema = z.enum(['tasks', 'expenses', 'maintenance_records'])
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

const conversionSchemas = {
  tasks: z.object({
    title: z.string().trim().min(1).max(200),
    description: nullableText(2_000),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  expenses: z.object({
    description: z.string().trim().min(1).max(500),
    amount: z.coerce.number().finite().positive(),
    expense_date: dateString('Data'),
    category: z.string().trim().min(1).max(100).optional(),
  }),
  maintenance_records: z.object({
    asset_name: z.string().trim().min(1).max(200),
    notes: nullableText(2_000),
    maintenance_date: optionalDateString('Data').nullable().optional(),
  }),
} as const

export async function convertOccurrence(id: string, targetTable: string, payload: unknown) {
  const occurrenceId = parseRecordId(id)
  const target = targetSchema.parse(targetTable)
  const supabase = await createAdminClient({ permission: 'operations.write' })
  const validatedPayload = target === 'tasks'
    ? conversionSchemas.tasks.parse(payload)
    : target === 'expenses'
      ? conversionSchemas.expenses.parse(payload)
      : conversionSchemas.maintenance_records.parse(payload)

  const { data, error } = await supabase.rpc('convert_occurrence_transactional', {
    p_occurrence_id: occurrenceId,
    p_target_table: target,
    p_payload: validatedPayload,
  })

  if (error) throw new Error(`Erro ao converter ocorrência: ${error.message}`)
  const result = data?.[0]
  if (!result?.success) {
    throw new Error(result?.error_message || 'Não foi possível converter a ocorrência.')
  }

  revalidatePath('/occurrences')
  revalidatePath('/tasks')
  revalidatePath('/finance')
  revalidatePath('/maintenance')
  return { success: true }
}

export async function archiveOccurrence(id: string) {
  const occurrenceId = parseRecordId(id)
  const supabase = await createAdminClient({ permission: 'operations.write' })
  await updateRecordState(supabase, {
    table: 'occurrences',
    id: occurrenceId,
    fromStatus: 'pending_review',
    values: { status: 'archived' },
    label: 'Ocorrência',
  })
  revalidatePath('/occurrences')
  return { success: true }
}
