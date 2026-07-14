import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'

const evidenceIdSchema = z.string().uuid()

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const parsedId = evidenceIdSchema.safeParse((await context.params).id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Evidência inválida.' }, { status: 400 })
  }

  try {
    const supabase = await createAdminClient({ permission: 'read' })
    const { data: attachment, error } = await supabase
      .from('attachments')
      .select('storage_path, mime_type, media_kind, status')
      .eq('id', parsedId.data)
      .eq('media_kind', 'document')
      .eq('mime_type', 'application/pdf')
      .neq('status', 'deleted')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!attachment?.storage_path) {
      return NextResponse.json({ error: 'PDF não encontrado.' }, { status: 404 })
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from('ai-evidence')
      .createSignedUrl(attachment.storage_path, 120)
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || 'URL não gerada.')

    const response = NextResponse.redirect(signed.signedUrl, 303)
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  } catch (error) {
    const unauthorized = error instanceof Error
      && /não autorizado|perfil ativo|permissão/i.test(error.message)
    return NextResponse.json(
      { error: unauthorized ? 'Não autorizado.' : 'Não foi possível abrir o PDF.' },
      { status: unauthorized ? 401 : 500 },
    )
  }
}
