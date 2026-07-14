import { shiftCivilDate } from '@/lib/date'

export function getStrategicAnalysisWindow(today: string) {
  const start = shiftCivilDate(today, -89)
  const previousEnd = shiftCivilDate(start, -1)
  const previousStart = shiftCivilDate(previousEnd, -89)
  return { start, end: today, previousStart, previousEnd }
}

export function keepKnownEvidenceKeys(keys: string[], facts: Array<{ key: string }>) {
  const known = new Set(facts.map(fact => fact.key))
  return [...new Set(keys)].filter(key => known.has(key))
}
