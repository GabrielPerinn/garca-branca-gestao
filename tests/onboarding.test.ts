import assert from 'node:assert/strict'
import test from 'node:test'

import {
  farmFoundationDraftPayloadSchema,
  farmFoundationSchema,
  farmProfileSchema,
  isValidBrazilianTaxId,
} from '../src/lib/onboarding/schema'

const validProfile = {
  name: 'Fazenda Garça Branca',
  legal_name: '',
  document_number: '',
  state_registration: '',
  owner_name: 'Gabriel',
  owner_phone: '',
  municipality: 'Cáceres',
  state_code: 'MT',
  postal_code: '',
  address: '',
  location_description: '',
  total_area_ha: 1_500,
  productive_area_ha: 1_200,
  primary_activity: 'beef_cattle' as const,
  livestock_system: 'extensive' as const,
  timezone: 'America/Cuiaba' as const,
  notes: '',
}

test('valida CPF e CNPJ sem aceitar sequências artificiais', () => {
  assert.equal(isValidBrazilianTaxId('529.982.247-25'), true)
  assert.equal(isValidBrazilianTaxId('04.252.011/0001-10'), true)
  assert.equal(isValidBrazilianTaxId('111.111.111-11'), false)
  assert.equal(isValidBrazilianTaxId('04.252.011/0001-11'), false)
})

test('perfil exige localização e áreas coerentes', () => {
  assert.equal(farmProfileSchema.safeParse(validProfile).success, true)
  assert.equal(farmProfileSchema.safeParse({ ...validProfile, state_code: 'MATO GROSSO' }).success, false)
  assert.equal(farmProfileSchema.safeParse({ ...validProfile, productive_area_ha: 2_000 }).success, false)
})

test('implantação limita volume e rejeita saldos iniciais negativos', () => {
  const result = farmFoundationSchema.safeParse({
    farm_id: null,
    profile: validProfile,
    pastures: [{ name: 'Pasto 1', property_name: 'Fazenda Sede', approximate_capacity: 80, current_condition: 'Boa' }],
    cattle_lots: [{ name: 'Recria', category: 'Novilhas', current_quantity: -1, pasture_name: 'Pasto 1' }],
    employees: [],
    inventory_items: [],
    land_parcels: [{ name: 'Fazenda Sede', tenure_type: 'owned', total_area_ha: 1_500, usable_area_ha: 1_200, municipality: 'Cáceres', state_code: 'MT', property_registration: '', car_code: '', ccir_code: '', cib_nirf: '', georeferencing_status: 'not_informed', notes: '' }],
    farm_assets: [],
    rural_contracts: [],
  })

  assert.equal(result.success, false)
})

test('implantação aceita várias propriedades e exige o vínculo correto de cada pasto', () => {
  const base = {
    farm_id: null,
    profile: validProfile,
    pastures: [
      { name: 'Pasto Sede', property_name: 'Fazenda Sede', approximate_capacity: 80, current_condition: 'Boa' },
      { name: 'Pasto Retiro', property_name: 'Fazenda Retiro', approximate_capacity: 120, current_condition: 'Boa' },
    ],
    cattle_lots: [], employees: [], inventory_items: [], farm_assets: [], rural_contracts: [],
    land_parcels: [
      { name: 'Fazenda Sede', tenure_type: 'owned', total_area_ha: 700, usable_area_ha: 600, municipality: 'Cáceres', state_code: 'MT', property_registration: '', car_code: '', ccir_code: '', cib_nirf: '', georeferencing_status: 'not_informed', notes: '' },
      { name: 'Fazenda Retiro', tenure_type: 'leased_in', total_area_ha: 800, usable_area_ha: 600, municipality: 'Cáceres', state_code: 'MT', property_registration: '', car_code: '', ccir_code: '', cib_nirf: '', georeferencing_status: 'pending', notes: '' },
    ],
  }

  assert.equal(farmFoundationSchema.safeParse(base).success, true)
  assert.equal(farmFoundationSchema.safeParse({ ...base, pastures: [{ ...base.pastures[0], property_name: 'Fazenda inexistente' }] }).success, false)
  assert.equal(farmFoundationSchema.safeParse({ ...base, land_parcels: [base.land_parcels[0], { ...base.land_parcels[1], name: 'fazenda sede' }] }).success, false)
})

test('rascunho aceita etapas parciais sem relaxar a validação da conclusão', () => {
  const partial = {
    profile: { name: 'Operação ainda incompleta', municipality: '' },
    pastures: [], cattle_lots: [], employees: [], inventory_items: [],
    land_parcels: [{ id: 'linha-local', name: '', total_area_ha: '' }],
    farm_assets: [], rural_contracts: [],
  }

  assert.equal(farmFoundationDraftPayloadSchema.safeParse(partial).success, true)
  assert.equal(farmFoundationSchema.safeParse({
    farm_id: null,
    ...partial,
  }).success, false)
})

test('rascunho rejeita campos gigantes e listas acima do limite operacional', () => {
  const baseDraft = {
    profile: { name: 'Base parcial' },
    pastures: [], cattle_lots: [], employees: [], inventory_items: [],
    land_parcels: [], farm_assets: [], rural_contracts: [],
  }

  assert.equal(farmFoundationDraftPayloadSchema.safeParse({
    ...baseDraft,
    profile: { notes: 'x'.repeat(4_001) },
  }).success, false)
  assert.equal(farmFoundationDraftPayloadSchema.safeParse({
    ...baseDraft,
    pastures: Array.from({ length: 101 }, (_, index) => ({ id: String(index) })),
  }).success, false)
})
