import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const manifestPath = process.argv[2]
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!manifestPath || !supabaseUrl || !serviceRoleKey) throw new Error('Manifesto e credenciais de serviço são obrigatórios.')

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    backup_id: string
    created_at: string
    retained_until: string
    database_bytes: number
    storage_bytes: number
    encrypted_bytes: number
    encrypted_sha256: string
    restore_drill: boolean
  }
  const client = createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.rpc('record_data_protection_run', {
    p_backup_id: manifest.backup_id,
    p_target: 'github_actions_encrypted_artifact',
    p_status: manifest.restore_drill ? 'verified' : 'completed',
    p_started_at: manifest.created_at,
    p_completed_at: new Date().toISOString(),
    p_verified_at: manifest.restore_drill ? new Date().toISOString() : null,
    p_retained_until: manifest.retained_until,
    p_database_bytes: manifest.database_bytes,
    p_storage_bytes: manifest.storage_bytes,
    p_encrypted_sha256: manifest.encrypted_sha256,
    p_manifest: { version: 1, restore_drill: manifest.restore_drill, encrypted_bytes: manifest.encrypted_bytes },
    p_error_summary: null,
  })
  if (error) throw new Error(`Falha ao registrar a evidência do backup: ${error.message}`)
  console.log(`Evidência registrada: ${manifest.backup_id}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
