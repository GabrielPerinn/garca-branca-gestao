import type { Metadata } from 'next'
import { getTwinDashboardData } from '@/lib/twin/data'
import { TwinClientPage } from './client-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Garça Twin',
  description: 'Gêmeo digital e histórico operacional verificável da fazenda.',
}

export default async function TwinPage() {
  const data = await getTwinDashboardData()
  return <TwinClientPage {...data} />
}
