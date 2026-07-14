import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWeighingMeasurements } from '@/lib/ai/weighing-normalization'

test('calcula quantidade, total e média a partir dos pesos copiados do papel', () => {
  const result = normalizeWeighingMeasurements({ individual_weights: [400, '420', '440,5'] })
  assert.deepEqual(result.individual_weights, [400, 420, 440.5])
  assert.equal(result.quantity_weighed, 3)
  assert.equal(result.total_weight, 1260.5)
  assert.equal(result.average_weight, 420.167)
})

test('deriva média quando a anotação traz somente quantidade e peso total', () => {
  const result = normalizeWeighingMeasurements({ quantity_weighed: 10, total_weight: 4_500 })
  assert.equal(result.average_weight, 450)
  assert.equal(result.total_weight, 4_500)
})

test('preserva medição por média e calcula o total quando há quantidade', () => {
  const result = normalizeWeighingMeasurements({ average_weight: 412.5, quantity_weighed: 20 })
  assert.equal(result.total_weight, 8_250)
  assert.equal(result.individual_weights, null)
})

test('bloqueia quantidade divergente da lista', () => {
  assert.throws(
    () => normalizeWeighingMeasurements({ individual_weights: [400, 420], quantity_weighed: 3 }),
    /lista contém 2 pesos/,
  )
})

test('bloqueia soma ou média declarada que não fecha com a lista', () => {
  assert.throws(
    () => normalizeWeighingMeasurements({ individual_weights: [400, 420], total_weight: 900 }),
    /soma da lista/,
  )
  assert.throws(
    () => normalizeWeighingMeasurements({ individual_weights: [400, 420], average_weight: 430 }),
    /média da lista/,
  )
})

test('rejeita pesos impossíveis, listas vazias e fração de animal', () => {
  assert.throws(() => normalizeWeighingMeasurements({ individual_weights: [0] }), /Peso 1/)
  assert.throws(() => normalizeWeighingMeasurements({ individual_weights: [2_001] }), /faixa permitida/)
  assert.throws(() => normalizeWeighingMeasurements({ individual_weights: [] }), /vazia/)
  assert.throws(() => normalizeWeighingMeasurements({ average_weight: 400, quantity_weighed: 2.5 }), /inteira/)
})

test('exige uma forma completa de medição', () => {
  assert.throws(
    () => normalizeWeighingMeasurements({ quantity_weighed: 10 }),
    /peso médio, uma lista de pesos ou o peso total/,
  )
})
