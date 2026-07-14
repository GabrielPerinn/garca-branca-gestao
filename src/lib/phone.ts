export function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

/**
 * WhatsApp can identify Brazilian mobile numbers with or without the ninth
 * subscriber digit. Both forms must map to the same authorized identity.
 */
export function phoneIdentityVariants(value: string) {
  const normalized = normalizePhone(value)
  const variants = new Set<string>()

  if (!/^\d{8,15}$/.test(normalized)) return variants
  variants.add(normalized)

  if (!normalized.startsWith('55')) return variants

  if (normalized.length === 13 && normalized[4] === '9') {
    variants.add(`${normalized.slice(0, 4)}${normalized.slice(5)}`)
  } else if (normalized.length === 12) {
    variants.add(`${normalized.slice(0, 4)}9${normalized.slice(4)}`)
  }

  return variants
}

export function phonesAreEquivalent(left: string, right: string) {
  const leftVariants = phoneIdentityVariants(left)
  const rightVariants = phoneIdentityVariants(right)

  for (const candidate of leftVariants) {
    if (rightVariants.has(candidate)) return true
  }
  return false
}
