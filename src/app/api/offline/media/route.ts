import { NextResponse } from 'next/server'
import { processChatAction } from '@/app/ai-chat/actions'
import { createServiceRoleClient, requirePermission } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { profile } = await requirePermission('operations.write')
    const supabase = createServiceRoleClient({ actorProfileId: profile.id })
    const { data: authorized, error: deviceError } = await supabase.rpc('authorize_offline_device', {
      p_device_id: request.headers.get('x-offline-device-id'), p_actor_profile_id: profile.id,
      p_register: false, p_display_name: null,
    })
    if (deviceError || !authorized) return NextResponse.json({ success: false, error: 'Aparelho offline não autorizado.' }, { status: 403 })
    const formData = await request.formData()
    const result = await processChatAction(formData)
    return NextResponse.json(result, { status: result.success ? 200 : 422 })
  } catch (caught) {
    return NextResponse.json({ success: false, error: caught instanceof Error ? caught.message : 'Não foi possível processar a mídia.' }, { status: 400 })
  }
}
