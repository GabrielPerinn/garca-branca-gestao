type ActionPayload = Record<string, unknown>

type Requirement = {
  canonical: string
  aliases: string[]
}

const requirements: Record<string, Requirement[]> = {
  create_expense: [
    { canonical: 'amount', aliases: ['amount'] },
    { canonical: 'description', aliases: ['description'] },
  ],
  create_revenue: [
    { canonical: 'amount', aliases: ['amount'] },
    { canonical: 'description', aliases: ['description'] },
  ],
  create_task: [
    { canonical: 'title', aliases: ['title', 'description'] },
    { canonical: 'due_date', aliases: ['due_date'] },
  ],
  complete_task: [
    { canonical: 'task_name', aliases: ['task_name', 'task_id', 'title'] },
  ],
  cancel_task: [
    { canonical: 'task_name', aliases: ['task_name', 'task_id', 'title'] },
  ],
  create_cattle_lot: [
    { canonical: 'name', aliases: ['name'] },
    { canonical: 'current_quantity', aliases: ['current_quantity', 'quantity'] },
  ],
  record_inventory_entry: [
    { canonical: 'item_name', aliases: ['item_name', 'item', 'product_name', 'name'] },
    { canonical: 'quantity', aliases: ['quantity'] },
    { canonical: 'unit', aliases: ['unit'] },
  ],
  record_cattle_sale: [
    { canonical: 'buyer_name', aliases: ['buyer_name', 'buyer'] },
    { canonical: 'quantity', aliases: ['quantity'] },
    { canonical: 'gross_amount', aliases: ['gross_amount', 'amount'] },
    { canonical: 'lot_name', aliases: ['lot_name', 'cattle_lot_name', 'cattle_lot_id'] },
  ],
  record_cattle_movement: [
    { canonical: 'movement_type', aliases: ['movement_type'] },
    { canonical: 'quantity', aliases: ['quantity'] },
  ],
  record_weighing: [
    { canonical: 'average_weight', aliases: ['average_weight', 'individual_weights'] },
    { canonical: 'lot_name', aliases: ['lot_name', 'cattle_lot_name', 'cattle_lot_id'] },
  ],
  create_livestock_protocol: [
    { canonical: 'name', aliases: ['name'] },
    { canonical: 'protocol_type', aliases: ['protocol_type'] },
    { canonical: 'event_type', aliases: ['event_type'] },
    { canonical: 'scope_type', aliases: ['scope_type'] },
    { canonical: 'next_due_date', aliases: ['next_due_date', 'date'] },
  ],
  complete_livestock_protocol: [
    { canonical: 'protocol_name', aliases: ['protocol_name', 'protocol_id', 'name'] },
  ],
  record_employee_payment: [
    { canonical: 'employee_name', aliases: ['employee_name', 'employee_id'] },
    { canonical: 'amount', aliases: ['amount'] },
    { canonical: 'payment_type', aliases: ['payment_type'] },
  ],
  record_gravel_operation: [
    { canonical: 'origin_location', aliases: ['origin_location'] },
  ],
  record_suppression_operation: [
    { canonical: 'notes', aliases: ['notes', 'location_description'] },
    { canonical: 'approximate_area', aliases: ['approximate_area'] },
    { canonical: 'authorization_number', aliases: ['authorization_number'] },
  ],
  create_rural_contract: [
    { canonical: 'parcel_name', aliases: ['parcel_name'] },
    { canonical: 'contract_type', aliases: ['contract_type'] },
    { canonical: 'farm_role', aliases: ['farm_role'] },
    { canonical: 'counterparty_name', aliases: ['counterparty_name'] },
    { canonical: 'start_date', aliases: ['start_date'] },
    { canonical: 'end_date', aliases: ['end_date'] },
    { canonical: 'area_ha', aliases: ['area_ha'] },
    { canonical: 'activity', aliases: ['activity'] },
    { canonical: 'payment_type', aliases: ['payment_type'] },
  ],
}

export const blockingFieldLabels: Record<string, string> = {
  amount: 'valor',
  description: 'descrição',
  title: 'título',
  due_date: 'data ou prazo',
  purchase_amount: 'valor total ou valor por animal',
  acquisition_expense: 'despesa correspondente à compra dos animais',
  amount_consistency: 'correção dos valores divergentes da compra e da despesa',
  task_name: 'tarefa',
  current_quantity: 'quantidade',
  item_name: 'item',
  quantity: 'quantidade',
  unit: 'unidade',
  buyer_name: 'comprador',
  gross_amount: 'valor bruto',
  lot_name: 'lote',
  movement_type: 'tipo de movimentação',
  to_pasture_name: 'pasto de destino',
  average_weight: 'peso médio, lista de pesos ou peso total com quantidade',
  protocol_name: 'protocolo sanitário ou reprodutivo',
  protocol_type: 'tipo sanitário ou reprodutivo',
  event_type: 'tipo do manejo',
  scope_type: 'abrangência do protocolo',
  next_due_date: 'data programada',
  animal_category: 'categoria animal',
  land_parcel_name: 'propriedade',
  weighing_consistency: 'conferência dos pesos, quantidade, soma e média',
  employee_name: 'funcionário',
  payment_type: 'tipo de pagamento',
  origin_location: 'local de origem',
  volume_or_loads: 'volume ou quantidade de cargas',
  approximate_area: 'área aproximada',
  authorization_number: 'número da autorização ambiental',
  parcel_name: 'imóvel ou área cedida',
  contract_type: 'modalidade do contrato',
  farm_role: 'se a fazenda cede ou recebe a terra',
  counterparty_name: 'nome da contraparte',
  start_date: 'data de início',
  end_date: 'data de término',
  area_ha: 'área contratada em hectares',
  activity: 'atividade autorizada',
  payment_amount: 'valor do contrato',
  payment_frequency: 'frequência do pagamento',
  first_due_date: 'primeiro vencimento',
  expense_date: 'data da despesa',
  supplier_name: 'fornecedor ou emissor',
  payment_status: 'situação do pagamento',
  product_name: 'produto usado como pagamento',
  product_quantity: 'quantidade do produto',
  production_percentage: 'percentual da produção',
}

function hasValue(payload: ActionPayload, aliases: string[]) {
  return aliases.some((alias) => {
    const value = payload[alias]
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim() !== ''
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0
    return true
  })
}

export function getBlockingFields(
  actionType: string,
  payload: ActionPayload,
  reportedMissingFields: unknown,
) {
  const actionRequirements = [...(requirements[actionType] ?? [])]

  if (
    actionType === 'record_cattle_movement'
    && payload.movement_type !== 'purchase'
  ) {
    actionRequirements.push({ canonical: 'lot_name', aliases: ['lot_name', 'cattle_lot_name', 'cattle_lot_id'] })
  }
  if (actionType === 'create_expense' && payload.source_document === true) {
    actionRequirements.push(
      { canonical: 'expense_date', aliases: ['expense_date', 'date', 'document_issue_date'] },
      { canonical: 'supplier_name', aliases: ['supplier_name'] },
      { canonical: 'payment_status', aliases: ['payment_status'] },
    )
  }
  if (actionType === 'create_rural_contract' && String(payload.payment_type) !== 'free') {
    actionRequirements.push(
      { canonical: 'payment_frequency', aliases: ['payment_frequency'] },
      { canonical: 'first_due_date', aliases: ['first_due_date'] },
    )
  }
  if (
    actionType === 'create_rural_contract'
    && ['fixed_money', 'per_hectare'].includes(String(payload.payment_type))
  ) {
    actionRequirements.push(
      { canonical: 'payment_amount', aliases: ['payment_amount'] },
    )
  }
  if (
    actionType === 'create_rural_contract'
    && ['product_quantity', 'mixed'].includes(String(payload.payment_type))
  ) {
    actionRequirements.push(
      { canonical: 'product_name', aliases: ['product_name'] },
      { canonical: 'product_quantity', aliases: ['product_quantity'] },
    )
  }
  if (
    actionType === 'create_rural_contract'
    && ['production_percentage', 'mixed'].includes(String(payload.payment_type))
  ) {
    actionRequirements.push({ canonical: 'production_percentage', aliases: ['production_percentage'] })
  }
  if (
    actionType === 'record_cattle_movement'
    && payload.movement_type === 'purchase'
    && !hasValue(payload, ['total_amount', 'price_per_unit'])
  ) {
    actionRequirements.push({
      canonical: 'purchase_amount',
      aliases: ['total_amount', 'price_per_unit'],
    })
  }
  if (actionType === 'record_cattle_movement' && payload.movement_type === 'pasture_change') {
    actionRequirements.push({
      canonical: 'to_pasture_name',
      aliases: ['to_pasture_name', 'to_pasture_id'],
    })
  }
  if (actionType === 'create_livestock_protocol' && payload.scope_type === 'lot') {
    actionRequirements.push({ canonical: 'lot_name', aliases: ['lot_name', 'cattle_lot_name', 'cattle_lot_id'] })
  }
  if (actionType === 'create_livestock_protocol' && payload.scope_type === 'property') {
    actionRequirements.push({ canonical: 'land_parcel_name', aliases: ['land_parcel_name', 'land_parcel_id', 'property_name'] })
  }
  if (actionType === 'create_livestock_protocol' && payload.scope_type === 'category') {
    actionRequirements.push({ canonical: 'animal_category', aliases: ['animal_category'] })
  }
  if (
    actionType === 'record_gravel_operation'
    && !hasValue(payload, ['loads_quantity', 'estimated_volume'])
  ) {
    actionRequirements.push({
      canonical: 'volume_or_loads',
      aliases: ['loads_quantity', 'estimated_volume'],
    })
  }

  void reportedMissingFields

  return actionRequirements
    .filter((requirement) => {
      if (
        actionType === 'record_weighing'
        && requirement.canonical === 'average_weight'
        && hasValue(payload, ['total_weight'])
        && hasValue(payload, ['quantity_weighed'])
      ) return false
      return !hasValue(payload, requirement.aliases)
    })
    .map((requirement) => requirement.canonical)
}
