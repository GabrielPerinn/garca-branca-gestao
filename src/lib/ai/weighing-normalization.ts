export type WeighingMeasurements = {
  average_weight?: unknown
  quantity_weighed?: unknown
  total_weight?: unknown
  individual_weights?: unknown
  [key: string]: unknown
}

const MAX_INDIVIDUAL_WEIGHTS = 2_000
const MAX_CATTLE_WEIGHT_KG = 2_000
const CONSISTENCY_TOLERANCE_KG = 0.1

function optionalPositiveNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} deve ser positivo.`)
  return parsed
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000
}

export function normalizeWeighingMeasurements<T extends WeighingMeasurements>(payload: T): T & {
  average_weight: number
  quantity_weighed?: number | null
  total_weight?: number | null
  individual_weights?: number[] | null
} {
  const declaredAverage = optionalPositiveNumber(payload.average_weight, 'Peso médio')
  const declaredQuantity = optionalPositiveNumber(payload.quantity_weighed, 'Quantidade pesada')
  const declaredTotal = optionalPositiveNumber(payload.total_weight, 'Peso total')
  const rawWeights = payload.individual_weights

  if (rawWeights !== null && rawWeights !== undefined) {
    if (!Array.isArray(rawWeights) || rawWeights.length === 0) {
      throw new Error('A lista de pesos individuais está vazia ou inválida.')
    }
    if (rawWeights.length > MAX_INDIVIDUAL_WEIGHTS) {
      throw new Error(`A pesagem excede o limite de ${MAX_INDIVIDUAL_WEIGHTS} animais por lançamento.`)
    }

    const individualWeights = rawWeights.map((value, index) => {
      const parsed = optionalPositiveNumber(value, `Peso ${index + 1}`)
      if (parsed === null || parsed > MAX_CATTLE_WEIGHT_KG) {
        throw new Error(`Peso ${index + 1} está fora da faixa permitida.`)
      }
      return roundWeight(parsed)
    })
    const quantity = individualWeights.length
    const total = roundWeight(individualWeights.reduce((sum, value) => sum + value, 0))
    const average = roundWeight(total / quantity)

    if (declaredQuantity !== null && (!Number.isInteger(declaredQuantity) || declaredQuantity !== quantity)) {
      throw new Error(`A lista contém ${quantity} pesos, mas a quantidade informada é ${declaredQuantity}.`)
    }
    if (declaredTotal !== null && Math.abs(declaredTotal - total) > CONSISTENCY_TOLERANCE_KG) {
      throw new Error(`A soma da lista é ${total} kg, diferente do total informado (${declaredTotal} kg).`)
    }
    if (declaredAverage !== null && Math.abs(declaredAverage - average) > CONSISTENCY_TOLERANCE_KG) {
      throw new Error(`A média da lista é ${average} kg, diferente da média informada (${declaredAverage} kg).`)
    }

    return {
      ...payload,
      individual_weights: individualWeights,
      quantity_weighed: quantity,
      total_weight: total,
      average_weight: average,
    }
  }

  if (declaredQuantity !== null && !Number.isInteger(declaredQuantity)) {
    throw new Error('Quantidade pesada deve ser inteira.')
  }
  const calculatedAverage = declaredAverage ?? (
    declaredTotal !== null && declaredQuantity !== null
      ? roundWeight(declaredTotal / declaredQuantity)
      : null
  )
  if (calculatedAverage === null) {
    throw new Error('Informe o peso médio, uma lista de pesos ou o peso total com a quantidade.')
  }
  if (
    declaredAverage !== null
    && declaredTotal !== null
    && declaredQuantity !== null
    && Math.abs(declaredAverage * declaredQuantity - declaredTotal) > CONSISTENCY_TOLERANCE_KG
  ) {
    throw new Error('Peso médio, quantidade e peso total não fecham entre si.')
  }

  return {
    ...payload,
    average_weight: calculatedAverage,
    quantity_weighed: declaredQuantity,
    total_weight: declaredTotal ?? (declaredQuantity !== null ? roundWeight(calculatedAverage * declaredQuantity) : null),
    individual_weights: null,
  }
}
