export const MAX_WHATSAPP_PDF_BYTES = 50 * 1024 * 1024

export function safePdfFilename(value: string | undefined, externalMessageId: string) {
  const normalized = value
    ?.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  const safeMessageId = externalMessageId
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(-80) || 'whatsapp'
  const base = normalized || `documento-${safeMessageId}.pdf`
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

export function hasPdfSignature(bytes: Uint8Array) {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 1_024))).toString('latin1')
  return prefix.includes('%PDF-')
}
