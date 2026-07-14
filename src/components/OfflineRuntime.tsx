'use client'

import Link from 'next/link'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getOfflineDeviceId, listOfflineCommands, listOfflineMedia, markOfflineCommandFailure, markOfflineMediaFailure, removeOfflineCommand, removeOfflineMedia, saveOfflineWorkPackage, type OfflineWorkPackage } from '@/lib/offline/queue'

export function OfflineRuntime() {
  const online = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange); window.addEventListener('offline', onChange)
      return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
    },
    () => navigator.onLine,
    () => true,
  )
  const [queued, setQueued] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncingRef = useRef(false)

  const refreshWorkPackage = useCallback(async () => {
    if (!navigator.onLine) return
    const response = await fetch('/api/offline/package', {
      credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Offline-Device-Id': getOfflineDeviceId(), 'X-Offline-Device-Name': 'Navegador de campo' },
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(result?.error || `Não foi possível autorizar este aparelho (HTTP ${response.status}).`)
    }
    const workPackage = await response.json() as OfflineWorkPackage
    if (workPackage.version === 2) await saveOfflineWorkPackage(workPackage)
  }, [])

  const refreshCount = useCallback(async () => {
    try {
      const [commands, media] = await Promise.all([listOfflineCommands(), listOfflineMedia()])
      setQueued(commands.length + media.length)
    } catch { setQueued(0) }
  }, [])

  const synchronize = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return
    syncingRef.current = true; setSyncing(true)
    try {
      setSyncError(null)
      await refreshWorkPackage()
      const commands = await listOfflineCommands()
      for (const command of commands) {
        try {
          const response = await fetch('/api/offline/sync', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              id: command.id, type: command.type, device_id: command.device_id,
              client_created_at: command.client_created_at, payload: command.payload,
            }),
          })
          const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null
          if (response.ok && result?.success) await removeOfflineCommand(command.id)
          else await markOfflineCommandFailure(command, result?.error || `Falha HTTP ${response.status}`)
        } catch (caught) {
          await markOfflineCommandFailure(command, caught instanceof Error ? caught.message : 'Conexão interrompida.')
          break
        }
      }
      const mediaDrafts = await listOfflineMedia()
      for (const draft of mediaDrafts) {
        try {
          const formData = new FormData()
          formData.set('external_message_id', `offline-media:${draft.id}`)
          formData.set('message', draft.caption || (draft.kind === 'image'
            ? 'Leia esta foto de campo, extraia somente os dados visíveis e prepare os lançamentos para minha confirmação.'
            : 'Transcreva este áudio de campo e prepare os lançamentos para minha confirmação.'))
          formData.set(draft.kind, new File([draft.blob], draft.file_name, { type: draft.mime_type }))
          const response = await fetch('/api/offline/media', {
            method: 'POST', credentials: 'same-origin', body: formData,
            headers: { 'X-Offline-Device-Id': getOfflineDeviceId() },
          })
          const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null
          if (response.ok && result?.success) await removeOfflineMedia(draft.id)
          else await markOfflineMediaFailure(draft, result?.error || `Falha HTTP ${response.status}`)
        } catch (caught) {
          await markOfflineMediaFailure(draft, caught instanceof Error ? caught.message : 'Conexão interrompida.')
          break
        }
      }
      await refreshWorkPackage().catch(() => undefined)
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : 'Não foi possível sincronizar o aparelho.')
    } finally {
      syncingRef.current = false; setSyncing(false); await refreshCount()
    }
  }, [refreshCount, refreshWorkPackage])

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
    const handleOnline = () => { void synchronize() }
    const handleQueue = () => {
      void refreshCount()
      if (navigator.onLine) void synchronize()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('garca-offline-queue-changed', handleQueue)
    const initialSync = window.setTimeout(() => {
      void refreshCount().then(() => { if (navigator.onLine) void synchronize() })
    }, 0)
    return () => {
      window.clearTimeout(initialSync)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('garca-offline-queue-changed', handleQueue)
    }
  }, [refreshCount, synchronize])

  if (online && queued === 0 && !syncError) return null
  return <div role="status" className={`fixed inset-x-3 bottom-3 z-[90] mx-auto flex max-w-xl items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${online ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-300 bg-slate-900 text-white'}`}>
    {syncing ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <CloudOff className="h-4 w-4 shrink-0" />}
    <span className="min-w-0 flex-1">{!online ? `Sem internet. ${queued ? `${queued} registro(s) protegido(s) no aparelho.` : 'Você pode registrar manejos na área offline.'}` : syncing ? `Sincronizando ${queued} registro(s)...` : syncError || `${queued} registro(s) aguardando sincronização.`}</span>
    <Link href="/offline" className="shrink-0 font-semibold underline underline-offset-2">Abrir</Link>
  </div>
}
