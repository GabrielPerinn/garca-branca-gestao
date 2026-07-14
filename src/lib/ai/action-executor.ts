import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getCivilDate } from '@/lib/date'
import { getBlockingFields } from '@/lib/ai/action-metadata'
import { getPendingActionPlanIssues } from '@/lib/ai/action-plan'
import { normalizeWeighingMeasurements } from '@/lib/ai/weighing-normalization'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day
  }, 'data inválida')
const uuid = z.string().uuid('identificador inválido')
const positiveNumber = z.coerce.number().finite().positive()
const positiveInteger = z.coerce.number().int().positive()
const text = z.string().trim().min(1).max(500)
const referenceName = z.string().trim().min(1).max(200)

const lotReference = {
  cattle_lot_id: uuid.optional(),
  cattle_lot_name: referenceName.optional(),
  lot_name: referenceName.optional(),
}

const actionSchemas = {
  create_expense: z.object({
    amount: positiveNumber,
    description: text,
    category: z.string().trim().min(1).max(100).optional(),
    expense_date: isoDate.optional(),
    date: isoDate.optional(),
    supplier_name: z.string().trim().min(1).max(200).optional(),
    supplier_document: z.string().trim().min(1).max(40).optional(),
    payment_method: z.string().trim().min(1).max(100).optional(),
    payment_status: z.enum(['paid', 'pending']).optional(),
    payment_due_date: isoDate.optional(),
    document_issue_date: isoDate.optional(),
    fiscal_document_type: z.string().trim().min(1).max(80).optional(),
    fiscal_document_number: z.string().trim().min(1).max(100).optional(),
    fiscal_access_key: z.string().trim().regex(/^\d{44}$/).optional(),
    source_document: z.boolean().optional(),
    has_receipt: z.boolean().optional(),
  }).passthrough(),
  create_revenue: z.object({
    amount: positiveNumber,
    description: text,
    category: z.string().trim().min(1).max(100).optional(),
    revenue_date: isoDate.optional(),
    date: isoDate.optional(),
  }).passthrough(),
  create_task: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    due_date: isoDate.nullable().optional(),
    date: isoDate.optional(),
    assigned_to: referenceName.optional(),
    employee_name: referenceName.optional(),
  }).passthrough(),
  complete_task: z.object({
    task_id: uuid.optional(),
    task_name: referenceName.optional(),
    title: referenceName.optional(),
  }).refine(
    (payload) => Boolean(payload.task_id || payload.task_name || payload.title),
    { message: 'tarefa é obrigatória' },
  ).passthrough(),
  cancel_task: z.object({
    task_id: uuid.optional(),
    task_name: referenceName.optional(),
    title: referenceName.optional(),
  }).refine(
    (payload) => Boolean(payload.task_id || payload.task_name || payload.title),
    { message: 'tarefa é obrigatória' },
  ).passthrough(),
  create_cattle_lot: z.object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(100).nullable().optional(),
    current_quantity: positiveInteger,
    origin: z.string().trim().max(300).nullable().optional(),
  }).passthrough(),
  record_inventory_entry: z.object({
    item_name: referenceName,
    quantity: positiveNumber,
    unit: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(100).nullable().optional(),
    movement_date: isoDate.optional(),
    date: isoDate.optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  }).passthrough(),
  record_cattle_sale: z.object({
    ...lotReference,
    buyer_name: z.string().trim().min(1).max(200),
    quantity: positiveInteger,
    gross_amount: positiveNumber,
    negotiation_date: isoDate.optional(),
    date: isoDate.optional(),
    shipment_date: isoDate.nullable().optional(),
  }).passthrough(),
  record_cattle_movement: z.object({
    ...lotReference,
    movement_type: z.enum(['purchase', 'birth', 'death', 'pasture_change']),
    quantity: positiveInteger,
    movement_date: isoDate.optional(),
    date: isoDate.optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    origin: z.string().trim().max(300).nullable().optional(),
    animal_category: z.string().trim().max(100).nullable().optional(),
    to_pasture_id: uuid.optional(),
    to_pasture_name: referenceName.optional(),
  }).passthrough().superRefine((payload, context) => {
    if (
      payload.movement_type === 'pasture_change'
      && !payload.to_pasture_id
      && !payload.to_pasture_name
    ) {
      context.addIssue({
        code: 'custom',
        path: ['to_pasture_name'],
        message: 'pasto de destino é obrigatório',
      })
    }
  }),
  record_weighing: z.object({
    ...lotReference,
    average_weight: positiveNumber.nullable().optional(),
    quantity_weighed: positiveInteger.nullable().optional(),
    total_weight: positiveNumber.nullable().optional(),
    individual_weights: z.array(z.union([positiveNumber, z.string().trim().min(1)])).max(2_000).nullable().optional(),
    weighing_date: isoDate.optional(),
    date: isoDate.optional(),
  }).passthrough(),
  create_livestock_protocol: z.object({
    name: z.string().trim().min(2).max(200),
    protocol_type: z.enum(['sanitary', 'reproductive']),
    event_type: z.string().trim().min(2).max(80),
    scope_type: z.enum(['operation', 'property', 'lot', 'category']),
    cattle_lot_id: uuid.optional(),
    cattle_lot_name: referenceName.optional(),
    lot_name: referenceName.optional(),
    land_parcel_id: uuid.optional(),
    land_parcel_name: referenceName.optional(),
    property_name: referenceName.optional(),
    animal_category: z.string().trim().min(1).max(100).nullable().optional(),
    responsible_employee_id: uuid.optional(),
    responsible_employee_name: referenceName.optional(),
    product_name: z.string().trim().max(160).nullable().optional(),
    dosage: z.string().trim().max(120).nullable().optional(),
    withdrawal_days: z.coerce.number().int().min(0).max(3_650).nullable().optional(),
    instructions: z.string().trim().max(2_000).nullable().optional(),
    next_due_date: isoDate.optional(),
    date: isoDate.optional(),
    recurrence_days: z.coerce.number().int().min(1).max(3_650).nullable().optional(),
    alert_lead_days: z.coerce.number().int().min(0).max(365).optional(),
  }).passthrough(),
  complete_livestock_protocol: z.object({
    protocol_id: uuid.optional(),
    protocol_name: referenceName.optional(),
    name: referenceName.optional(),
    executed_on: isoDate.optional(),
    date: isoDate.optional(),
    quantity_treated: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    result_status: z.enum(['completed', 'partial', 'skipped']).optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
    next_due_date: isoDate.nullable().optional(),
  }).refine(payload => Boolean(payload.protocol_id || payload.protocol_name || payload.name), {
    message: 'protocolo é obrigatório',
  }).passthrough(),
  record_employee_payment: z.object({
    employee_id: uuid.optional(),
    employee_name: referenceName.optional(),
    payment_type: z.string().trim().min(1).max(100),
    amount: positiveNumber,
    payment_date: isoDate.optional(),
    date: isoDate.optional(),
    description: z.string().trim().max(500).optional(),
  }).refine(
    (payload) => Boolean(payload.employee_id || payload.employee_name),
    { message: 'funcionário é obrigatório' },
  ).passthrough(),
  record_gravel_operation: z.object({
    origin_location: z.string().trim().min(1).max(500),
    loads_quantity: positiveInteger.nullable().optional(),
    estimated_volume: positiveNumber.nullable().optional(),
    destination_location: z.string().trim().max(500).nullable().optional(),
    purpose: z.string().trim().max(500).nullable().optional(),
    machine_used: z.string().trim().max(200).nullable().optional(),
    responsible_person: z.string().trim().max(200).nullable().optional(),
    operation_date: isoDate.optional(),
    date: isoDate.optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  }).refine(
    (payload) => Boolean(payload.loads_quantity || payload.estimated_volume),
    { message: 'volume ou quantidade de cargas é obrigatório' },
  ).passthrough(),
  record_suppression_operation: z.object({
    approximate_area: positiveNumber,
    notes: z.string().trim().min(2).max(2_000),
    authorization_number: z.string().trim().min(1).max(120),
    authorization_expiration_date: isoDate.nullable().optional(),
    responsible_technician: z.string().trim().max(200).nullable().optional(),
    operation_date: isoDate.optional(),
    date: isoDate.optional(),
  }).passthrough(),
  create_rural_contract: z.object({
    title: z.string().trim().min(3).max(200).nullable().optional(),
    contract_number: z.string().trim().max(120).nullable().optional(),
    parcel_name: z.string().trim().min(1).max(180),
    contract_type: z.enum(['rural_lease', 'rural_partnership', 'commodatum', 'sublease', 'other']),
    farm_role: z.enum(['grantor', 'grantee']),
    counterparty_name: z.string().trim().min(2).max(200),
    counterparty_document: z.string().trim().max(40).nullable().optional(),
    counterparty_phone: z.string().trim().max(30).nullable().optional(),
    start_date: isoDate,
    end_date: isoDate,
    area_ha: positiveNumber,
    activity: z.string().trim().min(2).max(200),
    crop_name: z.string().trim().max(120).nullable().optional(),
    payment_type: z.enum(['fixed_money', 'per_hectare', 'product_quantity', 'production_percentage', 'mixed', 'free']),
    payment_amount: positiveNumber.nullable().optional(),
    payment_frequency: z.enum(['monthly', 'quarterly', 'semiannual', 'annual', 'harvest', 'single', 'custom']).nullable().optional(),
    first_due_date: isoDate.nullable().optional(),
    installment_count: z.coerce.number().int().min(1).max(120).nullable().optional(),
    product_name: z.string().trim().max(120).nullable().optional(),
    product_quantity: positiveNumber.nullable().optional(),
    production_percentage: z.coerce.number().positive().max(100).nullable().optional(),
    adjustment_index: z.string().trim().max(80).nullable().optional(),
    renewal_notice_days: z.coerce.number().int().min(0).max(730).optional(),
    conservation_obligations: z.string().trim().max(2_000).nullable().optional(),
    improvement_responsibility: z.string().trim().max(2_000).nullable().optional(),
    tax_responsibility: z.string().trim().max(2_000).nullable().optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
  }).refine(payload => payload.end_date > payload.start_date, {
    path: ['end_date'], message: 'término deve ser posterior ao início',
  }).passthrough(),
} as const

type SupportedAction = keyof typeof actionSchemas

interface ExecutionStep {
  action_type: SupportedAction
  payload: Record<string, unknown>
}

interface PendingActionContext {
  actorProfileId?: string | null
  expectedSourceMessageId?: string
  reason?: string
}

function normalizeMovementType(value: unknown) {
  const movementType = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['transfer', 'pasture_transfer', 'pasture_movement', 'move'].includes(movementType)) {
    return 'pasture_change'
  }
  return movementType
}

function parseActionPayload(actionType: string, payload: unknown): Record<string, unknown> {
  if (!(actionType in actionSchemas)) throw new Error(`A ação '${actionType}' não é suportada.`)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload da ação inválido.')
  }

  const supportedAction = actionType as SupportedAction
  const rawPayload = payload as Record<string, unknown>
  const normalizedPayload: Record<string, unknown> = { ...rawPayload }

  if (supportedAction === 'record_cattle_sale') {
    normalizedPayload.buyer_name ??= rawPayload.buyer
    normalizedPayload.gross_amount ??= rawPayload.amount
  }
  if (supportedAction === 'create_cattle_lot') {
    normalizedPayload.current_quantity ??= rawPayload.quantity
  }
  if (supportedAction === 'record_inventory_entry') {
    normalizedPayload.item_name ??= rawPayload.item ?? rawPayload.product_name ?? rawPayload.name
    normalizedPayload.movement_date ??= rawPayload.date
  }
  if (supportedAction === 'record_cattle_movement') {
    normalizedPayload.movement_type = normalizeMovementType(rawPayload.movement_type)
  }
  if (
    supportedAction === 'record_cattle_sale'
    || supportedAction === 'record_cattle_movement'
    || supportedAction === 'record_weighing'
  ) {
    normalizedPayload.lot_name ??= rawPayload.cattle_lot_name
  }
  if (supportedAction === 'create_task') {
    normalizedPayload.title ??= rawPayload.description
  }
  if (supportedAction === 'complete_task' || supportedAction === 'cancel_task') {
    normalizedPayload.task_name ??= rawPayload.title
  }
  if (supportedAction === 'complete_livestock_protocol') {
    normalizedPayload.protocol_name ??= rawPayload.name
  }

  const blockingFields = getBlockingFields(
    supportedAction,
    normalizedPayload,
    rawPayload.missing_fields,
  )
  if (blockingFields.length > 0) {
    throw new Error(`Ação incompleta. Revise: ${blockingFields.join(', ')}.`)
  }

  const result = actionSchemas[supportedAction].safeParse(normalizedPayload)
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.path.join('.') || issue.message).join(', ')
    throw new Error(`Dados inválidos para ${actionType}: ${details}.`)
  }

  return result.data
}

function normalizeComparableName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEquivalentPayrollExpense(primary: ExecutionStep, secondary: ExecutionStep) {
  if (
    primary.action_type !== 'record_employee_payment'
    || secondary.action_type !== 'create_expense'
  ) {
    return false
  }

  const category = normalizeComparableName(String(secondary.payload.category ?? ''))
  const description = normalizeComparableName(String(secondary.payload.description ?? ''))
  const paymentType = normalizeComparableName(String(primary.payload.payment_type ?? ''))
  const employeeName = normalizeComparableName(String(primary.payload.employee_name ?? ''))
  const describesPayroll = category === 'folha de pagamento'
    || (paymentType.length > 0 && description.includes(paymentType))
    || (employeeName.length > 0 && description.includes(employeeName))

  return describesPayroll
    && Number(secondary.payload.amount) === Number(primary.payload.amount)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
  )
}

function buildExecutionPlan(primary: ExecutionStep, secondary: ExecutionStep[]) {
  const steps = [primary]
  const seen = new Set([JSON.stringify(canonicalize(primary))])

  for (const step of secondary) {
    if (isEquivalentPayrollExpense(primary, step)) continue

    const key = JSON.stringify(canonicalize(step))
    if (seen.has(key)) continue
    seen.add(key)
    steps.push(step)
  }

  return steps
}

async function resolveUniqueLot(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.cattle_lot_id === 'string') {
    const { data: lot, error } = await supabase
      .from('cattle_lots')
      .select('id, name')
      .eq('id', payload.cattle_lot_id)
      .or('status.is.null,status.neq.deleted')
      .maybeSingle()
    if (error) throw new Error(`Erro ao localizar lote: ${error.message}`)
    if (!lot) throw new Error('Lote não encontrado ou excluído.')
    return lot.id as string
  }

  const lotName = typeof payload.cattle_lot_name === 'string'
    ? payload.cattle_lot_name
    : typeof payload.lot_name === 'string' ? payload.lot_name : ''
  if (!lotName) throw new Error('Informe o lote por ID ou nome antes de aprovar.')

  const requestedName = normalizeComparableName(lotName)
  const { data: lots, error } = await supabase
    .from('cattle_lots')
    .select('id, name')
    .or('status.is.null,status.neq.deleted')
    .limit(501)
  if (error) throw new Error(`Erro ao localizar lote: ${error.message}`)
  if ((lots ?? []).length > 500) {
    throw new Error('Há muitos lotes para garantir correspondência única; informe o ID.')
  }

  const exact = (lots ?? []).filter(
    (lot) => normalizeComparableName(lot.name) === requestedName,
  )
  const matches = exact.length > 0
    ? exact
    : (lots ?? []).filter(
      (lot) => normalizeComparableName(lot.name).includes(requestedName),
    )
  if (matches.length === 0) throw new Error('Lote não encontrado ou excluído.')
  if (matches.length > 1) throw new Error('O nome corresponde a mais de um lote; informe o nome completo ou ID.')
  return matches[0].id as string
}

async function resolveUniquePasture(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.to_pasture_id === 'string') {
    const { data: pasture, error } = await supabase
      .from('pastures')
      .select('id')
      .eq('id', payload.to_pasture_id)
      .or('status.is.null,status.neq.deleted')
      .maybeSingle()
    if (error) throw new Error(`Erro ao localizar pasto: ${error.message}`)
    if (!pasture) throw new Error('Pasto de destino não encontrado ou excluído.')
    return pasture.id as string
  }

  const pastureName = String(payload.to_pasture_name ?? '')
  const requestedName = normalizeComparableName(pastureName)
  if (!requestedName) throw new Error('Informe o pasto de destino por ID ou nome.')

  const { data: pastures, error } = await supabase
    .from('pastures')
    .select('id, name')
    .or('status.is.null,status.neq.deleted')
    .limit(501)
  if (error) throw new Error(`Erro ao localizar pasto: ${error.message}`)
  if ((pastures ?? []).length > 500) {
    throw new Error('Há muitos pastos para garantir correspondência única; informe o ID.')
  }

  const exact = (pastures ?? []).filter(
    (pasture) => normalizeComparableName(pasture.name) === requestedName,
  )
  const matches = exact.length > 0
    ? exact
    : (pastures ?? []).filter(
      (pasture) => normalizeComparableName(pasture.name).includes(requestedName),
    )
  if (matches.length === 0) throw new Error('Pasto de destino não encontrado ou excluído.')
  if (matches.length > 1) throw new Error('O nome corresponde a mais de um pasto; informe o nome completo ou ID.')
  return matches[0].id as string
}

async function resolveUniqueLandParcel(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.land_parcel_id === 'string') {
    const { data, error } = await supabase.from('land_parcels').select('id')
      .eq('id', payload.land_parcel_id).neq('status', 'deleted').maybeSingle()
    if (error) throw new Error(`Erro ao localizar propriedade: ${error.message}`)
    if (!data) throw new Error('Propriedade não encontrada ou excluída.')
    return data.id as string
  }
  const requestedName = normalizeComparableName(String(payload.land_parcel_name ?? payload.property_name ?? ''))
  if (!requestedName) throw new Error('Informe a propriedade por nome ou ID.')
  const { data, error } = await supabase.from('land_parcels').select('id, name').neq('status', 'deleted').limit(501)
  if (error) throw new Error(`Erro ao localizar propriedade: ${error.message}`)
  if ((data ?? []).length > 500) throw new Error('Há muitas propriedades; informe o ID.')
  const exact = (data ?? []).filter(item => normalizeComparableName(item.name) === requestedName)
  const matches = exact.length ? exact : (data ?? []).filter(item => normalizeComparableName(item.name).includes(requestedName))
  if (matches.length === 0) throw new Error('Propriedade não encontrada ou excluída.')
  if (matches.length > 1) throw new Error('Mais de uma propriedade corresponde ao nome; informe o nome completo.')
  return matches[0].id as string
}

async function resolveUniqueLivestockProtocol(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.protocol_id === 'string') {
    const { data, error } = await supabase.from('livestock_protocols').select('id')
      .eq('id', payload.protocol_id).eq('status', 'active').maybeSingle()
    if (error) throw new Error(`Erro ao localizar protocolo: ${error.message}`)
    if (!data) throw new Error('Protocolo não encontrado, pausado ou concluído.')
    return data.id as string
  }
  const requestedName = normalizeComparableName(String(payload.protocol_name ?? payload.name ?? ''))
  if (!requestedName) throw new Error('Informe o protocolo por nome ou ID.')
  const { data, error } = await supabase.from('livestock_protocols').select('id, name')
    .eq('status', 'active').limit(501)
  if (error) throw new Error(`Erro ao localizar protocolo: ${error.message}`)
  if ((data ?? []).length > 500) throw new Error('Há muitos protocolos ativos; informe o ID.')
  const exact = (data ?? []).filter(item => normalizeComparableName(item.name) === requestedName)
  const matches = exact.length ? exact : (data ?? []).filter(item => {
    const name = normalizeComparableName(item.name)
    return name.includes(requestedName) || requestedName.includes(name)
  })
  if (matches.length === 0) throw new Error('Protocolo ativo não encontrado.')
  if (matches.length > 1) throw new Error('Mais de um protocolo corresponde à descrição; informe o nome completo.')
  return matches[0].id as string
}

async function resolvePrimaryFarm(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('farms').select('id').neq('status', 'deleted')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error) throw new Error(`Erro ao localizar a operação: ${error.message}`)
  if (!data) throw new Error('Cadastre a base da operação antes de criar protocolos.')
  return data.id as string
}

async function resolveUniqueEmployee(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.employee_id === 'string') {
    const { data: employee, error } = await supabase
      .from('employees')
      .select('id')
      .eq('id', payload.employee_id)
      .or('status.is.null,status.neq.deleted')
      .maybeSingle()
    if (error) throw new Error(`Erro ao localizar funcionário: ${error.message}`)
    if (!employee) throw new Error('Funcionário não encontrado ou excluído.')
    return employee.id as string
  }

  const employeeName = String(payload.employee_name ?? '')
  const requestedName = normalizeComparableName(employeeName)
  if (!requestedName) throw new Error('Informe o funcionário antes de aprovar.')

  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, full_name')
    .or('status.is.null,status.neq.deleted')
    .limit(501)
  if (error) throw new Error(`Erro ao localizar funcionário: ${error.message}`)
  if ((employees ?? []).length > 500) {
    throw new Error('Há muitos funcionários para garantir correspondência única; informe o ID.')
  }

  const exact = (employees ?? []).filter(
    (employee) => normalizeComparableName(employee.full_name) === requestedName,
  )
  const matches = exact.length > 0
    ? exact
    : (employees ?? []).filter(
      (employee) => normalizeComparableName(employee.full_name).includes(requestedName),
    )
  if (matches.length === 0) throw new Error('Funcionário não encontrado; revise a ação antes de aprovar.')
  if (matches.length > 1) throw new Error('Há mais de um funcionário com esse nome; informe o nome completo ou ID.')
  return matches[0].id as string
}

async function resolveUniqueTask(supabase: SupabaseClient, payload: Record<string, unknown>) {
  if (typeof payload.task_id === 'string') {
    const { data: task, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('id', payload.task_id)
      .in('status', ['pending', 'in_progress'])
      .maybeSingle()
    if (error) throw new Error(`Erro ao localizar tarefa: ${error.message}`)
    if (!task) throw new Error('Tarefa não encontrada ou já concluída.')
    return task.id as string
  }

  const taskName = String(payload.task_name ?? payload.title ?? '')
  const requestedName = normalizeComparableName(taskName)
  if (!requestedName) throw new Error('Informe a tarefa antes de aprovar.')

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title')
    .in('status', ['pending', 'in_progress'])
    .limit(501)
  if (error) throw new Error(`Erro ao localizar tarefa: ${error.message}`)
  if ((tasks ?? []).length > 500) throw new Error('Há muitas tarefas abertas; informe o ID.')

  const exact = (tasks ?? []).filter((task) => normalizeComparableName(task.title) === requestedName)
  const matches = exact.length > 0
    ? exact
    : (tasks ?? []).filter((task) => {
      const normalizedTitle = normalizeComparableName(task.title)
      return normalizedTitle.includes(requestedName) || requestedName.includes(normalizedTitle)
    })
  if (matches.length === 0) throw new Error('Tarefa aberta não encontrada.')
  if (matches.length > 1) throw new Error('Mais de uma tarefa corresponde à descrição; informe o título completo.')
  return matches[0].id as string
}

async function prepareExecutionStep(
  supabase: SupabaseClient,
  actionType: string,
  rawPayload: unknown,
  sourceMessageId: string | null,
  today: string,
): Promise<ExecutionStep> {
  const payload = parseActionPayload(actionType, rawPayload)
  const supportedAction = actionType as SupportedAction

  delete payload.secondary_actions
  delete payload.missing_fields
  payload.source_message_id = sourceMessageId

  switch (supportedAction) {
    case 'create_expense':
      payload.expense_date = payload.expense_date ?? payload.date ?? today
      break
    case 'create_revenue':
      payload.revenue_date = payload.revenue_date ?? payload.date ?? today
      break
    case 'create_task':
      payload.due_date = payload.due_date ?? payload.date ?? null
      break
    case 'complete_task':
    case 'cancel_task':
      payload.task_id = await resolveUniqueTask(supabase, payload)
      break
    case 'record_inventory_entry':
      payload.movement_date = payload.movement_date ?? payload.date ?? today
      break
    case 'record_cattle_sale':
      payload.negotiation_date = payload.negotiation_date ?? payload.date ?? today
      payload.cattle_lot_id = await resolveUniqueLot(supabase, payload)
      break
    case 'record_cattle_movement': {
      payload.movement_date = payload.movement_date ?? payload.date ?? today
      if (payload.movement_type === 'purchase') {
        payload.lot_name = typeof payload.lot_name === 'string' && payload.lot_name
          ? payload.lot_name
          : `${typeof payload.animal_category === 'string' ? payload.animal_category : 'Gado'} — Compra ${today}`
      } else {
        payload.cattle_lot_id = await resolveUniqueLot(supabase, payload)
        if (payload.movement_type === 'pasture_change') {
          payload.to_pasture_id = await resolveUniquePasture(supabase, payload)
        }
      }
      break
    }
    case 'record_weighing': {
      Object.assign(payload, normalizeWeighingMeasurements(payload))
      payload.weighing_date = payload.weighing_date ?? payload.date ?? today
      payload.cattle_lot_id = await resolveUniqueLot(supabase, payload)
      break
    }
    case 'create_livestock_protocol': {
      payload.farm_id = await resolvePrimaryFarm(supabase)
      payload.next_due_date = payload.next_due_date ?? payload.date ?? today
      payload.alert_lead_days ??= 7
      if (payload.scope_type === 'lot') payload.cattle_lot_id = await resolveUniqueLot(supabase, payload)
      else payload.cattle_lot_id = null
      if (payload.scope_type === 'property') payload.land_parcel_id = await resolveUniqueLandParcel(supabase, payload)
      else payload.land_parcel_id = null
      if (payload.scope_type !== 'category') payload.animal_category = null
      if (payload.responsible_employee_name && !payload.responsible_employee_id) {
        payload.employee_name = payload.responsible_employee_name
        payload.responsible_employee_id = await resolveUniqueEmployee(supabase, payload)
      }
      break
    }
    case 'complete_livestock_protocol':
      payload.protocol_id = await resolveUniqueLivestockProtocol(supabase, payload)
      payload.executed_on = payload.executed_on ?? payload.date ?? today
      payload.result_status ??= 'completed'
      break
    case 'record_employee_payment':
      payload.payment_date = payload.payment_date ?? payload.date ?? today
      payload.employee_id = await resolveUniqueEmployee(supabase, payload)
      break
    case 'record_gravel_operation':
    case 'record_suppression_operation':
      payload.operation_date = payload.operation_date ?? payload.date ?? today
      break
  }

  delete payload.date
  return { action_type: supportedAction, payload }
}

function decodeSecondaryActions(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return []
  const secondaryActions = (rawPayload as Record<string, unknown>).secondary_actions
  if (secondaryActions == null) return []
  if (!Array.isArray(secondaryActions)) throw new Error('Lista de ações secundárias inválida.')

  return secondaryActions.map((secondary) => {
    if (!secondary || typeof secondary !== 'object' || Array.isArray(secondary)) {
      throw new Error('Ação secundária inválida.')
    }
    const record = secondary as Record<string, unknown>
    if (typeof record.intent !== 'string') throw new Error('Intent da ação secundária inválido.')
    let payload = record.extracted_data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        throw new Error(`JSON inválido na ação secundária '${record.intent}'.`)
      }
    }
    return { actionType: record.intent, payload }
  })
}

async function markValidationFailure(
  supabase: SupabaseClient,
  actionId: string,
  expectedSourceMessageId: string | undefined,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : 'Plano de execução inválido.'
  const { error: rpcError } = await supabase.rpc('fail_pending_action_validation', {
    p_action_id: actionId,
    p_expected_source_message_id: expectedSourceMessageId ?? null,
    p_error_message: message,
  })
  if (rpcError) console.error('[AI] Falha ao marcar validação inválida:', rpcError.message)
}

export async function approvePendingActionInternal(
  supabase: SupabaseClient,
  actionId: string,
  context: PendingActionContext = {},
) {
  const { data: action, error: fetchError } = await supabase
    .from('pending_actions')
    .select('id, action_type, interpreted_data_json, source_message_id, confirmation_status')
    .eq('id', actionId)
    .maybeSingle()
  if (fetchError) throw new Error(`Erro ao buscar ação: ${fetchError.message}`)
  if (!action || action.confirmation_status !== 'pending') {
    throw new Error('Ação não encontrada ou já processada.')
  }
  if (context.expectedSourceMessageId && action.source_message_id !== context.expectedSourceMessageId) {
    throw new Error('A ação não pertence a esta conversa.')
  }

  let steps: ExecutionStep[]
  try {
    const rawPlan = action.interpreted_data_json
    if (!rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) {
      throw new Error('Plano de execução inválido.')
    }
    const planIssues = getPendingActionPlanIssues(
      action.action_type,
      rawPlan as Record<string, unknown>,
    )
    if (planIssues.length > 0) {
      throw new Error(`Plano incompleto ou inconsistente. Revise: ${[...new Set(planIssues.map(issue => issue.field))].join(', ')}.`)
    }
    const today = getCivilDate()
    const primary = await prepareExecutionStep(
      supabase,
      action.action_type,
      action.interpreted_data_json,
      action.source_message_id,
      today,
    )
    const secondary = decodeSecondaryActions(action.interpreted_data_json)
    const preparedSecondary = await Promise.all(
      secondary.map(({ actionType, payload }) =>
        prepareExecutionStep(supabase, actionType, payload, action.source_message_id, today)
      ),
    )
    steps = buildExecutionPlan(primary, preparedSecondary)
  } catch (error) {
    await markValidationFailure(supabase, actionId, context.expectedSourceMessageId, error)
    throw error
  }

  const taskUpdate = steps[0]?.action_type === 'complete_task' || steps[0]?.action_type === 'cancel_task'
  if (taskUpdate && steps.length !== 1) {
    const error = new Error('A atualização de tarefa deve ser confirmada separadamente.')
    await markValidationFailure(supabase, actionId, context.expectedSourceMessageId, error)
    throw error
  }

  const fieldOperation = steps[0]?.action_type === 'record_gravel_operation'
    || steps[0]?.action_type === 'record_suppression_operation'
  if (fieldOperation && steps.length !== 1) {
    const error = new Error('Operações de campo não podem conter ações secundárias.')
    await markValidationFailure(supabase, actionId, context.expectedSourceMessageId, error)
    throw error
  }

  const ruralContract = steps[0]?.action_type === 'create_rural_contract'
  if (ruralContract && steps.length !== 1) {
    const error = new Error('Contratos rurais devem ser confirmados separadamente.')
    await markValidationFailure(supabase, actionId, context.expectedSourceMessageId, error)
    throw error
  }

  const rpc = taskUpdate
    ? supabase.rpc(steps[0].action_type === 'cancel_task' ? 'cancel_task_pending_action' : 'complete_task_pending_action', {
      p_action_id: actionId,
      p_expected_source_message_id: context.expectedSourceMessageId ?? null,
      p_payload: steps[0].payload,
      p_actor_profile_id: context.actorProfileId ?? null,
      p_reason: context.reason ?? null,
    })
    : fieldOperation
    ? supabase.rpc('execute_field_operation_pending_action', {
      p_action_id: actionId,
      p_expected_source_message_id: context.expectedSourceMessageId ?? null,
      p_payload: steps[0].payload,
      p_actor_profile_id: context.actorProfileId ?? null,
      p_reason: context.reason ?? null,
    })
    : ruralContract
    ? supabase.rpc('execute_rural_contract_pending_action', {
      p_action_id: actionId,
      p_expected_source_message_id: context.expectedSourceMessageId ?? null,
      p_payload: steps[0].payload,
      p_actor_profile_id: context.actorProfileId ?? null,
      p_reason: context.reason ?? null,
    })
    : supabase.rpc('execute_pending_action_transactional_v4', {
      p_action_id: actionId,
      p_expected_source_message_id: context.expectedSourceMessageId ?? null,
      p_steps: steps,
      p_actor_profile_id: context.actorProfileId ?? null,
      p_reason: context.reason ?? null,
    })

  const { data, error } = await rpc
    .single()
  if (error) throw new Error(`Erro ao executar ação: ${error.message}`)
  const result = data as { success?: boolean; error_message?: string } | null
  if (!result?.success) throw new Error(result?.error_message || 'Não foi possível executar a ação.')
  return { success: true }
}

export async function rejectPendingActionInternal(
  supabase: SupabaseClient,
  actionId: string,
  context: PendingActionContext = {},
) {
  const { data, error } = await supabase
    .rpc('reject_pending_action_transactional', {
      p_action_id: actionId,
      p_expected_source_message_id: context.expectedSourceMessageId ?? null,
      p_actor_profile_id: context.actorProfileId ?? null,
      p_reason: context.reason ?? 'Rejected by user',
    })
    .single()
  if (error) throw new Error(`Erro ao rejeitar ação: ${error.message}`)
  const result = data as { success?: boolean; error_message?: string } | null
  if (!result?.success) throw new Error(result?.error_message || 'Ação não encontrada ou já processada.')
  return { success: true }
}
