import { z } from 'zod'

const cleanOptionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null)
const optionalNonNegative = z.number().finite().nonnegative().nullable().optional().transform((value) => value ?? null)
const optionalPositive = z.number().finite().positive().nullable().optional().transform((value) => value ?? null)
const optionalCivilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((value) => value || null)

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCpf(value: string) {
  if (value.length !== 11 || hasRepeatedDigits(value)) return false
  const calculate = (length: number) => {
    const total = value.slice(0, length).split('').reduce(
      (sum, digit, index) => sum + Number(digit) * (length + 1 - index),
      0,
    )
    const remainder = (total * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return calculate(9) === Number(value[9]) && calculate(10) === Number(value[10])
}

function isValidCnpj(value: string) {
  if (value.length !== 14 || hasRepeatedDigits(value)) return false
  const calculate = (base: string, weights: number[]) => {
    const total = base.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0)
    const remainder = total % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = calculate(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calculate(value.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return first === Number(value[12]) && second === Number(value[13])
}

export function isValidBrazilianTaxId(value: string) {
  const digits = onlyDigits(value)
  return isValidCpf(digits) || isValidCnpj(digits)
}

export const farmProfileSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da fazenda.').max(200),
  legal_name: cleanOptionalText(200),
  document_number: z.string().trim().max(30).optional().transform((value, context) => {
    if (!value) return null
    if (!isValidBrazilianTaxId(value)) {
      context.addIssue({ code: 'custom', message: 'CPF ou CNPJ inválido.' })
      return z.NEVER
    }
    return onlyDigits(value)
  }),
  state_registration: cleanOptionalText(40),
  owner_name: cleanOptionalText(200),
  owner_phone: cleanOptionalText(30),
  municipality: z.string().trim().min(2, 'Informe o município.').max(120),
  state_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Informe a UF com duas letras.'),
  postal_code: cleanOptionalText(12),
  address: cleanOptionalText(500),
  location_description: cleanOptionalText(500),
  total_area_ha: z.number().finite().positive('A área total deve ser maior que zero.'),
  productive_area_ha: optionalNonNegative,
  primary_activity: z.enum(['beef_cattle', 'dairy_cattle', 'mixed_cattle', 'agriculture', 'mixed_farming', 'other']),
  livestock_system: z.enum(['extensive', 'semi_intensive', 'intensive', 'not_applicable']),
  timezone: z.enum(['America/Cuiaba', 'America/Porto_Velho', 'America/Manaus', 'America/Sao_Paulo', 'America/Campo_Grande']),
  notes: cleanOptionalText(4_000),
}).refine(
  (profile) => profile.productive_area_ha === null || profile.productive_area_ha <= profile.total_area_ha,
  { path: ['productive_area_ha'], message: 'A área produtiva não pode superar a área total.' },
)

export const pastureFoundationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  property_name: z.string().trim().min(1, 'Selecione a propriedade do pasto.').max(180),
  approximate_capacity: optionalNonNegative,
  current_condition: cleanOptionalText(120),
})

export const cattleFoundationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: cleanOptionalText(100),
  current_quantity: z.number().int().nonnegative(),
  pasture_name: cleanOptionalText(160),
})

export const employeeFoundationSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  role_description: cleanOptionalText(150),
  salary_amount: optionalNonNegative,
  phone_number: cleanOptionalText(30),
})

export const inventoryFoundationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: cleanOptionalText(100),
  current_quantity: z.number().finite().nonnegative(),
  minimum_quantity: optionalNonNegative,
  unit: z.string().trim().min(1).max(40),
})

export const landParcelFoundationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  tenure_type: z.enum(['owned', 'leased_in', 'leased_out', 'partnership', 'commodatum', 'other']),
  total_area_ha: z.number().finite().positive(),
  usable_area_ha: optionalNonNegative,
  municipality: cleanOptionalText(120),
  state_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional().transform((value) => value || null),
  property_registration: cleanOptionalText(120),
  car_code: cleanOptionalText(120),
  ccir_code: cleanOptionalText(120),
  cib_nirf: cleanOptionalText(120),
  georeferencing_status: z.enum(['not_informed', 'pending', 'certified', 'not_applicable']),
  notes: cleanOptionalText(2_000),
}).refine(row => row.usable_area_ha === null || row.usable_area_ha <= row.total_area_ha, {
  path: ['usable_area_ha'], message: 'A área utilizável não pode superar a área total do imóvel.',
})

export const agriculturalFieldFoundationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  parcel_name: cleanOptionalText(180),
  area_ha: z.number().finite().positive(),
  current_use: cleanOptionalText(160),
  soil_type: cleanOptionalText(120),
  irrigation_type: cleanOptionalText(120),
  notes: cleanOptionalText(2_000),
})

export const farmAssetFoundationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  property_name: cleanOptionalText(180),
  asset_type: z.enum(['machine', 'vehicle', 'implement', 'building', 'storage', 'water', 'energy', 'corral', 'fence', 'other']),
  identification: cleanOptionalText(120),
  manufacturer: cleanOptionalText(120),
  model: cleanOptionalText(120),
  model_year: z.number().int().min(1900).max(2200).nullable().optional().transform(value => value ?? null),
  acquisition_date: optionalCivilDate,
  acquisition_value: optionalNonNegative,
  current_meter: optionalNonNegative,
  meter_unit: cleanOptionalText(40),
  location_description: cleanOptionalText(300),
  notes: cleanOptionalText(2_000),
})

export const ruralContractFoundationSchema = z.object({
  title: cleanOptionalText(200),
  contract_number: cleanOptionalText(120),
  parcel_name: z.string().trim().min(1).max(180),
  contract_type: z.enum(['rural_lease', 'rural_partnership', 'commodatum', 'sublease', 'other']),
  farm_role: z.enum(['grantor', 'grantee']),
  counterparty_name: z.string().trim().min(2).max(200),
  counterparty_document: cleanOptionalText(40),
  counterparty_phone: cleanOptionalText(30),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area_ha: z.number().finite().positive(),
  activity: z.string().trim().min(2).max(200),
  crop_name: cleanOptionalText(120),
  payment_type: z.enum(['fixed_money', 'per_hectare', 'product_quantity', 'production_percentage', 'mixed', 'free']),
  payment_amount: optionalPositive,
  payment_frequency: z.enum(['monthly', 'quarterly', 'semiannual', 'annual', 'harvest', 'single', 'custom']).nullable().optional().transform(value => value ?? null),
  first_due_date: optionalCivilDate,
  installment_count: z.number().int().min(1).max(120).nullable().optional().transform(value => value ?? null),
  product_name: cleanOptionalText(120),
  product_quantity: optionalPositive,
  production_percentage: z.number().finite().positive().max(100).nullable().optional().transform(value => value ?? null),
  adjustment_index: cleanOptionalText(80),
  renewal_notice_days: z.number().int().min(0).max(730).default(90),
  conservation_obligations: cleanOptionalText(2_000),
  improvement_responsibility: cleanOptionalText(2_000),
  tax_responsibility: cleanOptionalText(2_000),
  notes: cleanOptionalText(4_000),
}).superRefine((row, context) => {
  if (row.end_date <= row.start_date) context.addIssue({ code: 'custom', path: ['end_date'], message: 'O término do contrato deve ser posterior ao início.' })
  if (['fixed_money', 'per_hectare'].includes(row.payment_type) && (!row.payment_amount || !row.payment_frequency || !row.first_due_date)) {
    context.addIssue({ code: 'custom', path: ['payment_amount'], message: 'Pagamento em dinheiro exige valor, frequência e primeiro vencimento.' })
  }
  if (row.payment_type !== 'free' && (!row.payment_frequency || !row.first_due_date)) {
    context.addIssue({ code: 'custom', path: ['first_due_date'], message: 'A remuneração exige frequência e primeiro vencimento.' })
  }
  if (['product_quantity', 'mixed'].includes(row.payment_type) && (!row.product_name || !row.product_quantity)) {
    context.addIssue({ code: 'custom', path: ['product_name'], message: 'Informe o produto e a quantidade combinada.' })
  }
  if (['production_percentage', 'mixed'].includes(row.payment_type) && !row.production_percentage) {
    context.addIssue({ code: 'custom', path: ['production_percentage'], message: 'Informe o percentual da produção combinado.' })
  }
})

export const farmFoundationSchema = z.object({
  farm_id: z.string().uuid().nullable(),
  profile: farmProfileSchema,
  pastures: z.array(pastureFoundationSchema).max(100),
  cattle_lots: z.array(cattleFoundationSchema).max(100),
  employees: z.array(employeeFoundationSchema).max(100),
  inventory_items: z.array(inventoryFoundationSchema).max(200),
  land_parcels: z.array(landParcelFoundationSchema).max(100).default([]),
  farm_assets: z.array(farmAssetFoundationSchema).max(300).default([]),
  rural_contracts: z.array(ruralContractFoundationSchema).max(100).default([]),
}).superRefine((foundation, context) => {
  const normalizedPropertyNames = foundation.land_parcels.map(property => property.name.toLocaleLowerCase('pt-BR'))
  const propertyNames = new Set(normalizedPropertyNames)
  if (!foundation.farm_id && foundation.land_parcels.length === 0) {
    context.addIssue({ code: 'custom', path: ['land_parcels'], message: 'Cadastre ao menos uma propriedade rural.' })
  }
  if (propertyNames.size !== normalizedPropertyNames.length) {
    context.addIssue({ code: 'custom', path: ['land_parcels'], message: 'Cada propriedade precisa ter um nome diferente.' })
  }
  for (const [index, pasture] of foundation.pastures.entries()) {
    if (!propertyNames.has(pasture.property_name.toLocaleLowerCase('pt-BR'))) {
      context.addIssue({ code: 'custom', path: ['pastures', index, 'property_name'], message: `A propriedade do pasto “${pasture.name}” não está na base informada.` })
    }
  }
  for (const [index, asset] of foundation.farm_assets.entries()) {
    if (asset.property_name && !propertyNames.has(asset.property_name.toLocaleLowerCase('pt-BR'))) {
      context.addIssue({ code: 'custom', path: ['farm_assets', index, 'property_name'], message: `A propriedade do ativo “${asset.name}” não está na base informada.` })
    }
  }
})

const foundationDraftFieldSchema = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
])
const foundationDraftRowSchema = z.record(z.string().min(1).max(80), foundationDraftFieldSchema)

/**
 * Drafts intentionally accept incomplete rows and empty required fields. The
 * strict business schema above remains the only path that can conclude the
 * foundation and mutate domain records.
 */
export const farmFoundationDraftPayloadSchema = z.object({
  profile: foundationDraftRowSchema,
  pastures: z.array(foundationDraftRowSchema).max(100),
  cattle_lots: z.array(foundationDraftRowSchema).max(100),
  employees: z.array(foundationDraftRowSchema).max(100),
  inventory_items: z.array(foundationDraftRowSchema).max(200),
  land_parcels: z.array(foundationDraftRowSchema).max(100),
  farm_assets: z.array(foundationDraftRowSchema).max(300),
  rural_contracts: z.array(foundationDraftRowSchema).max(100),
}).strict()

export type FarmFoundation = z.infer<typeof farmFoundationSchema>
export type FarmProfileInput = z.input<typeof farmProfileSchema>
