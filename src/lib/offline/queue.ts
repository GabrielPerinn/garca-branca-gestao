'use client'

export type OfflineProtocolSnapshot = {
  id: string
  name: string
  next_due_date: string
  recurrence_days: number | null
  scope_label: string
}

export type OfflineWorkPackage = {
  version: 2
  saved_at: string
  protocols: OfflineProtocolSnapshot[]
  lots: Array<{ id: string; name: string; category: string | null; current_quantity: number; pasture_id: string | null }>
  pastures: Array<{ id: string; name: string }>
  tasks: Array<{ id: string; title: string; due_date: string | null; priority: string }>
  inventory: Array<{ id: string; name: string; unit: string | null; current_quantity: number }>
}

export type OfflineCommandType =
  | 'complete_livestock_protocol'
  | 'create_task'
  | 'complete_task'
  | 'record_weighing'
  | 'record_cattle_movement'
  | 'record_inventory_movement'
  | 'create_expense'

export type OfflineCommand = {
  id: string
  type: OfflineCommandType
  device_id: string
  client_created_at: string
  attempts: number
  last_error: string | null
  payload: Record<string, unknown>
}

export type OfflineMediaDraft = {
  id: string
  kind: 'image' | 'audio'
  blob: Blob
  file_name: string
  mime_type: string
  caption: string
  client_created_at: string
  attempts: number
  last_error: string | null
}

const DB_NAME = 'garca-branca-offline'
const DB_VERSION = 4
const COMMANDS = 'commands'
const SNAPSHOTS = 'snapshots'
const MEDIA = 'media'
const KEYS = 'keys'
let encryptionKeyPromise: Promise<CryptoKey> | null = null

type EncryptedRecord = { id?: string; encrypted: true; iv: number[]; ciphertext: ArrayBuffer }
type StoredMedia = {
  id: string
  encrypted: true
  metadata: EncryptedRecord
  file_iv: number[]
  file_ciphertext: ArrayBuffer
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(COMMANDS)) database.createObjectStore(COMMANDS, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(SNAPSHOTS)) database.createObjectStore(SNAPSHOTS)
      if (!database.objectStoreNames.contains(MEDIA)) database.createObjectStore(MEDIA, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(KEYS)) database.createObjectStore(KEYS)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento offline.'))
  })
}

async function loadOrCreateEncryptionKey() {
  const existing = await transaction<CryptoKey | undefined>(KEYS, 'readonly', store => store.get('device-data-key'))
  if (existing) return existing
  const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await transaction(KEYS, 'readwrite', store => store.put(generated, 'device-data-key'))
  return generated
}

async function getEncryptionKey() {
  encryptionKeyPromise ??= loadOrCreateEncryptionKey().catch((caught) => {
    encryptionKeyPromise = null
    throw caught
  })
  return encryptionKeyPromise
}

async function encryptJson(value: unknown, id?: string): Promise<EncryptedRecord> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  return { ...(id ? { id } : {}), encrypted: true, iv: Array.from(iv), ciphertext }
}

async function decryptJson<T>(value: unknown): Promise<T> {
  if (!value || typeof value !== 'object' || !('encrypted' in value)) return value as T
  const encrypted = value as EncryptedRecord
  const key = await getEncryptionKey()
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) }, key, encrypted.ciphertext)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

async function encryptBytes(bytes: ArrayBuffer) {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  return { iv: Array.from(iv), ciphertext }
}

async function decryptBytes(iv: number[], ciphertext: ArrayBuffer) {
  const key = await getEncryptionKey()
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext)
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const current = database.transaction(storeName, mode)
    const request = operation(current.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento offline.'))
    current.oncomplete = () => {
      database.close()
      resolve(result)
    }
    current.onerror = () => reject(current.error ?? new Error('Falha na transação offline.'))
    current.onabort = () => reject(current.error ?? new Error('A transação offline foi cancelada.'))
  })
}

export function getOfflineDeviceId() {
  const key = 'garca-branca-device-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

export async function queueOfflineCommand(input: Pick<OfflineCommand, 'type' | 'payload'>) {
  const command: OfflineCommand = {
    ...input,
    id: crypto.randomUUID(),
    device_id: getOfflineDeviceId(),
    client_created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  const encrypted = await encryptJson(command, command.id)
  await transaction(COMMANDS, 'readwrite', store => store.put(encrypted))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
  return command
}

export const queueHealthExecution = queueOfflineCommand

export async function listOfflineCommands() {
  const stored = await transaction<unknown[]>(COMMANDS, 'readonly', store => store.getAll())
  return Promise.all(stored.map(item => decryptJson<OfflineCommand>(item)))
}

export async function removeOfflineCommand(id: string) {
  await transaction(COMMANDS, 'readwrite', store => store.delete(id))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
}

export async function markOfflineCommandFailure(command: OfflineCommand, error: string) {
  const updated = { ...command, attempts: command.attempts + 1, last_error: error.slice(0, 1_000) }
  const encrypted = await encryptJson(updated, command.id)
  await transaction(COMMANDS, 'readwrite', store => store.put(encrypted))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
}

export async function saveOfflineProtocolSnapshot(protocols: OfflineProtocolSnapshot[]) {
  const snapshot = { saved_at: new Date().toISOString(), protocols }
  const encrypted = await encryptJson(snapshot)
  await transaction(SNAPSHOTS, 'readwrite', store => store.put(encrypted, 'livestock_protocols'))
}

export async function getOfflineProtocolSnapshot(): Promise<{ saved_at: string; protocols: OfflineProtocolSnapshot[] } | null> {
  const stored = await transaction<unknown>(SNAPSHOTS, 'readonly', store => store.get('livestock_protocols'))
  return stored ? decryptJson<{ saved_at: string; protocols: OfflineProtocolSnapshot[] }>(stored) : null
}

export async function saveOfflineWorkPackage(workPackage: OfflineWorkPackage) {
  const encrypted = await encryptJson(workPackage)
  await transaction(SNAPSHOTS, 'readwrite', store => store.put(encrypted, 'work_package_v2'))
  await saveOfflineProtocolSnapshot(workPackage.protocols)
  window.dispatchEvent(new CustomEvent('garca-offline-package-changed'))
}

export async function getOfflineWorkPackage(): Promise<OfflineWorkPackage | null> {
  const stored = await transaction<unknown>(SNAPSHOTS, 'readonly', store => store.get('work_package_v2'))
  return stored ? decryptJson<OfflineWorkPackage>(stored) : null
}

export async function queueOfflineMedia(file: File, caption: string) {
  const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : null
  if (!kind) throw new Error('Use uma foto JPEG/PNG/WebP ou um áudio compatível.')
  const limit = kind === 'image' ? 5 * 1024 * 1024 : 25 * 1024 * 1024
  if (file.size > limit) throw new Error(kind === 'image' ? 'A foto deve ter no máximo 5 MB.' : 'O áudio deve ter no máximo 25 MB.')
  const draft: OfflineMediaDraft = {
    id: crypto.randomUUID(), kind, blob: file, file_name: file.name || `${kind}-${Date.now()}`,
    mime_type: file.type, caption: caption.trim().slice(0, 4_000), client_created_at: new Date().toISOString(),
    attempts: 0, last_error: null,
  }
  const metadata = await encryptJson({ ...draft, blob: undefined })
  const encryptedFile = await encryptBytes(await file.arrayBuffer())
  const stored: StoredMedia = { id: draft.id, encrypted: true, metadata, file_iv: encryptedFile.iv, file_ciphertext: encryptedFile.ciphertext }
  await transaction(MEDIA, 'readwrite', store => store.put(stored))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
  return draft
}

export async function listOfflineMedia() {
  const stored = await transaction<Array<StoredMedia | OfflineMediaDraft>>(MEDIA, 'readonly', store => store.getAll())
  return Promise.all(stored.map(async item => {
    if (!('encrypted' in item)) return item
    const metadata = await decryptJson<Omit<OfflineMediaDraft, 'blob'>>(item.metadata)
    const bytes = await decryptBytes(item.file_iv, item.file_ciphertext)
    return { ...metadata, blob: new Blob([bytes], { type: metadata.mime_type }) }
  }))
}

export async function removeOfflineMedia(id: string) {
  await transaction(MEDIA, 'readwrite', store => store.delete(id))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
}

export async function markOfflineMediaFailure(draft: OfflineMediaDraft, error: string) {
  const updated = { ...draft, attempts: draft.attempts + 1, last_error: error.slice(0, 1_000) }
  const metadata = await encryptJson({ ...updated, blob: undefined })
  const encryptedFile = await encryptBytes(await draft.blob.arrayBuffer())
  await transaction(MEDIA, 'readwrite', store => store.put({ id: draft.id, encrypted: true, metadata, file_iv: encryptedFile.iv, file_ciphertext: encryptedFile.ciphertext } satisfies StoredMedia))
  window.dispatchEvent(new CustomEvent('garca-offline-queue-changed'))
}
