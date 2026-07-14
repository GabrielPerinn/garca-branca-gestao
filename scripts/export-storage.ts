import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

type StoredObject = {
  bucket: string
  path: string
  bytes: number
  sha256: string
  contentType: string | null
}

const outputArg = process.argv.indexOf('--output')
const outputRoot = path.resolve(outputArg >= 0 ? process.argv[outputArg + 1] ?? '' : '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!outputArg || !outputRoot) throw new Error('Use --output <diretório>.')
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para copiar os arquivos.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const files: StoredObject[] = []

function safeDestination(bucket: string, objectPath: string) {
  const root = path.resolve(outputRoot, 'objects')
  const destination = path.resolve(root, bucket, objectPath)
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error(`Caminho de Storage inválido: ${objectPath}`)
  return destination
}

async function copyPrefix(bucket: string, prefix = ''): Promise<void> {
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Falha ao listar ${bucket}/${prefix}: ${error.message}`)
    for (const entry of data ?? []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!entry.id) {
        await copyPrefix(bucket, objectPath)
        continue
      }
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectPath)
      if (downloadError || !blob) throw new Error(`Falha ao copiar ${bucket}/${objectPath}: ${downloadError?.message ?? 'arquivo vazio'}`)
      const bytes = Buffer.from(await blob.arrayBuffer())
      const destination = safeDestination(bucket, objectPath)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, bytes, { mode: 0o600 })
      files.push({
        bucket,
        path: objectPath,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        contentType: blob.type || null,
      })
    }
    if ((data?.length ?? 0) < pageSize) break
  }
}

async function main() {
  await mkdir(outputRoot, { recursive: true, mode: 0o700 })
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  if (bucketError) throw new Error(`Falha ao listar buckets: ${bucketError.message}`)
  for (const bucket of buckets ?? []) await copyPrefix(bucket.id)

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  await writeFile(path.join(outputRoot, 'storage-manifest.json'), `${JSON.stringify({
    version: 1,
    generated_at: new Date().toISOString(),
    bucket_count: buckets?.length ?? 0,
    object_count: files.length,
    total_bytes: totalBytes,
    objects: files,
  }, null, 2)}\n`, { mode: 0o600 })
  console.log(`Storage copiado: ${files.length} arquivo(s), ${totalBytes} byte(s).`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
