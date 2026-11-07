import { BLOOD_TYPES, DEBRIS_STATUSES } from '../types'
import type { EmergencyCall } from '../types'

export const STORAGE_VERSION = 1
export const KEYS = {
  outbox: 'afetmesh:v1:outbox',
  received: 'afetmesh:v1:received',
  lang: 'afetmesh:v1:lang',
} as const

export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface Envelope {
  version: number
  savedAt: string
  calls: unknown[]
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

export function isEmergencyCall(x: unknown): x is EmergencyCall {
  if (typeof x !== 'object' || x === null) return false
  const c = x as Record<string, unknown>
  return (
    isStr(c.id) &&
    c.id.length > 0 &&
    isStr(c.createdAt) &&
    !Number.isNaN(Date.parse(c.createdAt)) &&
    isStr(c.deviceId) &&
    isNum(c.lat) &&
    isNum(c.lng) &&
    isStr(c.locationNote) &&
    DEBRIS_STATUSES.includes(c.debrisStatus as never) &&
    BLOOD_TYPES.includes(c.bloodType as never) &&
    isNum(c.peopleCount) &&
    isNum(c.injuredCount) &&
    isBool(c.hasChildren) &&
    isBool(c.hasElderly) &&
    isBool(c.canCommunicate) &&
    isStr(c.narrative) &&
    (c.status === 'OPEN' || c.status === 'RESCUED') &&
    (c.hops === undefined || (Array.isArray(c.hops) && c.hops.every(isStr)))
  )
}

/** İki listeyi id üzerinden birleştirir. Aynı çağrıda "RESCUED" durumu kazanır. */
export function mergeCalls(existing: EmergencyCall[], incoming: EmergencyCall[]): EmergencyCall[] {
  const byId = new Map<string, EmergencyCall>()
  for (const c of [...existing, ...incoming]) {
    const prev = byId.get(c.id)
    if (!prev) byId.set(c.id, c)
    else if (c.status === 'RESCUED' && prev.status !== 'RESCUED') byId.set(c.id, { ...prev, status: 'RESCUED' })
  }
  return [...byId.values()]
}

/**
 * Bozuk, eski ya da kısmen hatalı veriye dayanıklı ayrıştırıcı.
 * Desteklenen biçimler: {version, calls:[...]} zarfı ve eski düz dizi.
 * Geçersiz kayıtlar atlanır, aynı id iki kez gelirse tek kayıt tutulur.
 */
export function parseCalls(raw: string | null | undefined): EmergencyCall[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  let list: unknown[]
  if (Array.isArray(data)) {
    list = data
  } else if (data && typeof data === 'object' && Array.isArray((data as Envelope).calls)) {
    const version = (data as Envelope).version
    if (typeof version !== 'number' || version > STORAGE_VERSION) return []
    list = (data as Envelope).calls
  } else {
    return []
  }
  return mergeCalls([], list.filter(isEmergencyCall))
}

export function serializeCalls(calls: EmergencyCall[], now: Date = new Date()): string {
  const env: Envelope = { version: STORAGE_VERSION, savedAt: now.toISOString(), calls }
  return JSON.stringify(env)
}

export function safeLocalStorage(getter: () => KVStore = () => window.localStorage): KVStore | undefined {
  try {
    return getter()
  } catch {
    return undefined
  }
}

export function loadCalls(key: string, store: KVStore | undefined): EmergencyCall[] {
  if (!store) return []
  try {
    return parseCalls(store.getItem(key))
  } catch {
    return []
  }
}

/** Kota dolması gibi hatalarda false döner, uygulamayı düşürmez. */
export function saveCalls(key: string, calls: EmergencyCall[], store: KVStore | undefined): boolean {
  if (!store) return false
  try {
    store.setItem(key, serializeCalls(calls))
    return true
  } catch {
    return false
  }
}

export function createMemoryStore(initial: Record<string, string> = {}): KVStore & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    dump: () => Object.fromEntries(data),
  }
}
