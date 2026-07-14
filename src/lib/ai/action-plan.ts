import type { AIResponse } from '@/lib/validation/ai-schema'
import { getBlockingFields } from '@/lib/ai/action-metadata'
import { normalizeWeighingMeasurements } from '@/lib/ai/weighing-normalization'

export type PlanIssue = {
  actionIndex: number
  intent: string
  field: string
  description: string
}

export function parseActionData(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function getAIResponsePlanIssues(plan: AIResponse): PlanIssue[] {
  return collectPlanIssues({
    primaryIntent: plan.intent,
    primaryData: parseActionData(plan.extracted_data),
    primaryDescription: plan.human_summary,
    primaryMissingFields: plan.missing_fields,
    secondaryActions: plan.secondary_actions ?? [],
  })
}

export function getPendingActionPlanIssues(
  actionType: string,
  payload: Record<string, unknown>,
): PlanIssue[] {
  return collectPlanIssues({
    primaryIntent: actionType,
    primaryData: payload,
    primaryDescription: typeof payload.human_summary === 'string' ? payload.human_summary : actionType,
    primaryMissingFields: payload.missing_fields,
    secondaryActions: Array.isArray(payload.secondary_actions) ? payload.secondary_actions : [],
  })
}

function collectPlanIssues(input: {
  primaryIntent: string
  primaryData: Record<string, unknown>
  primaryDescription: string
  primaryMissingFields: unknown
  secondaryActions: unknown[]
}): PlanIssue[] {
  const actions = [{
    intent: input.primaryIntent,
    data: input.primaryData,
    description: input.primaryDescription,
    missingFields: input.primaryMissingFields,
  }, ...input.secondaryActions.map((rawAction) => {
    const action = rawAction && typeof rawAction === 'object' && !Array.isArray(rawAction)
      ? rawAction as Record<string, unknown>
      : {}
    const data = parseActionData(action.extracted_data)
    return {
      intent: typeof action.intent === 'string' ? action.intent : 'unknown',
      data,
      description: typeof action.description === 'string' ? action.description : 'ação relacionada',
      missingFields: data.missing_fields,
    }
  })]

  const issues = actions.flatMap((action, actionIndex) => (
    getBlockingFields(action.intent, action.data, action.missingFields).map((field) => ({
      actionIndex,
      intent: action.intent,
      field,
      description: action.description,
    }))
  ))

  for (const [actionIndex, action] of actions.entries()) {
    if (action.intent !== 'record_weighing') continue
    if (getBlockingFields(action.intent, action.data, action.missingFields).length > 0) continue
    try {
      normalizeWeighingMeasurements(action.data)
    } catch {
      issues.push({
        actionIndex,
        intent: action.intent,
        field: 'weighing_consistency',
        description: action.description,
      })
    }
  }

  for (const [purchaseIndex, purchase] of actions.entries()) {
    if (purchase.intent !== 'record_cattle_movement' || purchase.data.movement_type !== 'purchase') continue

    const quantity = Number(purchase.data.quantity)
    const declaredTotal = Number(purchase.data.total_amount)
    const unitPrice = Number(purchase.data.price_per_unit)
    const expectedAmount = Number.isFinite(declaredTotal) && declaredTotal > 0
      ? declaredTotal
      : Number.isFinite(unitPrice) && unitPrice > 0 && Number.isFinite(quantity) && quantity > 0
        ? unitPrice * quantity
        : null
    const acquisitionExpenses = actions.filter((action) => {
      if (action.intent !== 'create_expense') return false
      const context = `${String(action.data.category ?? '')} ${String(action.data.description ?? '')}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
      return context.includes('aquisicao de gado')
        || context.includes('compra de gado')
        || context.includes('compra de animais')
        || context.includes('compra de bezer')
        || context.includes('compra de boi')
    })

    if (expectedAmount !== null && acquisitionExpenses.length === 0) {
      issues.push({
        actionIndex: purchaseIndex,
        intent: purchase.intent,
        field: 'acquisition_expense',
        description: purchase.description,
      })
    } else if (expectedAmount !== null) {
      const hasMatchingExpense = acquisitionExpenses.some((expense) => {
        const expenseAmount = Number(expense.data.amount)
        return Number.isFinite(expenseAmount) && Math.abs(expenseAmount - expectedAmount) <= 0.01
      })
      if (!hasMatchingExpense) {
        issues.push({
          actionIndex: purchaseIndex,
          intent: purchase.intent,
          field: 'amount_consistency',
          description: purchase.description,
        })
      }
    }
  }

  return issues
}
