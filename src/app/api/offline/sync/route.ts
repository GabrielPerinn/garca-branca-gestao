import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const uuid = z.string().uuid()
const base = {
  id: uuid,
  device_id: z.string().trim().max(200).nullable().optional(),
  client_created_at: z.string().datetime({ offset: true }),
}
const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('complete_livestock_protocol'), payload: z.object({
    protocol_id: uuid.nullable().optional(), protocol_name: z.string().trim().min(1).max(200),
    executed_on: date, quantity_treated: z.number().int().nonnegative().nullable().optional(),
    result_status: z.enum(['completed', 'partial', 'skipped']), notes: z.string().trim().max(2_000).nullable().optional(),
    next_due_date: date.nullable().optional(),
  }) }),
  z.object({ ...base, type: z.literal('create_task'), payload: z.object({
    title: z.string().trim().min(1).max(200), description: z.string().trim().max(2_000).nullable().optional(),
    due_date: date.nullable().optional(), priority: z.enum(['low', 'medium', 'high']), notes: z.string().trim().max(2_000).nullable().optional(),
  }) }),
  z.object({ ...base, type: z.literal('complete_task'), payload: z.object({
    task_id: uuid, task_name: z.string().trim().min(1).max(200), notes: z.string().trim().max(2_000).nullable().optional(),
  }) }),
  z.object({ ...base, type: z.literal('record_weighing'), payload: z.object({
    cattle_lot_id: uuid, lot_name: z.string().trim().min(1).max(200), weighing_date: date,
    quantity_weighed: z.number().int().positive().nullable().optional(), average_weight: z.number().positive().max(2_000).nullable().optional(),
    total_weight: z.number().positive().nullable().optional(), individual_weights: z.array(z.number().positive().max(2_000)).max(2_000).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  }).refine(value => Boolean(value.average_weight || value.individual_weights?.length || (value.total_weight && value.quantity_weighed)), { message: 'Informe peso médio, total com quantidade ou a lista de pesos.' }) }),
  z.object({ ...base, type: z.literal('record_cattle_movement'), payload: z.object({
    cattle_lot_id: uuid, lot_name: z.string().trim().min(1).max(200),
    movement_type: z.enum(['birth', 'death', 'pasture_change']), quantity: z.number().int().positive(), movement_date: date,
    to_pasture_id: uuid.nullable().optional(), reason: z.string().trim().max(500).nullable().optional(),
  }).superRefine((value, context) => {
    if (value.movement_type === 'pasture_change' && !value.to_pasture_id) context.addIssue({ code: 'custom', path: ['to_pasture_id'], message: 'Pasto de destino obrigatório.' })
  }) }),
  z.object({ ...base, type: z.literal('record_inventory_movement'), payload: z.object({
    inventory_item_id: uuid, item_name: z.string().trim().min(1).max(200), movement_type: z.enum(['in', 'out']),
    quantity: z.number().positive(), unit: z.string().trim().max(50).nullable().optional(), movement_date: date,
    reason: z.string().trim().max(500).nullable().optional(), notes: z.string().trim().max(2_000).nullable().optional(),
  }) }),
  z.object({ ...base, type: z.literal('create_expense'), payload: z.object({
    description: z.string().trim().min(1).max(500), amount: z.number().positive(), category: z.string().trim().max(100).nullable().optional(),
    expense_date: date, payment_method: z.string().trim().max(100).nullable().optional(), supplier_name: z.string().trim().max(200).nullable().optional(),
    has_receipt: z.boolean().optional(),
  }) }),
])

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = commandSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Comando offline inválido.' }, { status: 400 })

    const command = parsed.data
    const { profile } = await requirePermission(command.type === 'create_expense' ? 'finance.write' : 'operations.write')
    const supabase = createServiceRoleClient({ actorProfileId: profile.id })
    const { data, error } = await supabase.rpc('process_offline_field_command', {
      p_command_id: command.id,
      p_actor_profile_id: profile.id,
      p_command_type: command.type,
      p_payload: command.payload,
      p_device_id: command.device_id ?? null,
      p_client_created_at: command.client_created_at,
    }).single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    const result = data as { success?: boolean; error_message?: string | null; already_processed?: boolean; record_id?: string | null } | null
    return NextResponse.json({
      success: Boolean(result?.success), error: result?.error_message ?? null,
      already_processed: Boolean(result?.already_processed), record_id: result?.record_id ?? null,
    }, { status: result?.success ? 200 : 409 })
  } catch (caught) {
    return NextResponse.json({ success: false, error: caught instanceof Error ? caught.message : 'Não foi possível sincronizar.' }, { status: 401 })
  }
}
