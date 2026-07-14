import type { NextRequest } from 'next/server'
import {
  getManagementReport,
  InvalidReportRangeError,
  managementReportToCsv,
  parseReportRange,
} from '@/lib/reports/management'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const range = parseReportRange(
      request.nextUrl.searchParams.get('from'),
      request.nextUrl.searchParams.get('to'),
    )
    const report = await getManagementReport(range)
    const csv = managementReportToCsv(report)
    const filename = `relatorio-gerencial-${range.from}-a-${range.to}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'text/csv; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof InvalidReportRangeError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'unknown'
    const unauthorized = message === 'Não autorizado.' || message === 'Usuário sem perfil ativo.'
    console.error('[Reports] Falha ao exportar relatório:', unauthorized ? 'unauthorized' : message)
    return Response.json(
      { error: unauthorized ? 'Não autorizado.' : 'Não foi possível gerar o relatório.' },
      { status: unauthorized ? 401 : 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
