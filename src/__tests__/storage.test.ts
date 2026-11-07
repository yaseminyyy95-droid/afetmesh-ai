import { describe, expect, it } from 'vitest'
import {
  createMemoryStore,
  isEmergencyCall,
  KEYS,
  loadCalls,
  mergeCalls,
  parseCalls,
  safeLocalStorage,
  saveCalls,
  serializeCalls,
  STORAGE_VERSION,
} from '../lib/storage'
import type { KVStore } from '../lib/storage'
import { makeCall } from '../test/factories'

const a = makeCall({ id: 'A' })
const b = makeCall({ id: 'B', debrisStatus: 'TRAPPED', hops: ['N1', 'N2'] })

describe('isEmergencyCall', () => {
  it('geçerli kaydı kabul eder', () => expect(isEmergencyCall(b)).toBe(true))
  it.each([
    null,
    42,
    { ...a, id: '' },
    { ...a, createdAt: 'dün' },
    { ...a, lat: Number.NaN },
    { ...a, bloodType: 'Z' },
    { ...a, debrisStatus: 'X' },
    { ...a, status: 'LOST' },
    { ...a, hasChildren: 'evet' },
    { ...a, hops: ['N1', 3] },
    { ...a, hops: 'N1' },
  ])('geçersiz kaydı reddeder: %o', (x) => expect(isEmergencyCall(x)).toBe(false))
})

describe('parseCalls (offline storage parser)', () => {
  it('boş/null → []', () => {
    expect(parseCalls(null)).toEqual([])
    expect(parseCalls('')).toEqual([])
  })
  it('bozuk JSON → []', () => expect(parseCalls('{"calls": [')).toEqual([]))
  it('beklenmeyen şekil → []', () => expect(parseCalls('"merhaba"')).toEqual([]))
  it('eski düz dizi biçimini okur', () => expect(parseCalls(JSON.stringify([a, b]))).toEqual([a, b]))
  it('zarf biçimini okur', () => expect(parseCalls(serializeCalls([a, b]))).toEqual([a, b]))
  it('gelecek sürüm zarfını yok sayar', () => {
    expect(parseCalls(JSON.stringify({ version: STORAGE_VERSION + 1, calls: [a] }))).toEqual([])
    expect(parseCalls(JSON.stringify({ calls: [a] }))).toEqual([])
  })
  it('geçersiz kayıtları atlar, geçerlileri korur', () => {
    expect(parseCalls(JSON.stringify([a, { id: 'kırık' }, null, b]))).toEqual([a, b])
  })
  it('aynı id tekrarlarını birleştirir', () => {
    expect(parseCalls(JSON.stringify([a, a, b]))).toHaveLength(2)
  })
})

describe('serializeCalls', () => {
  it('sürüm ve zaman damgası yazar', () => {
    const env = JSON.parse(serializeCalls([a], new Date('2026-02-06T00:00:00Z')))
    expect(env).toMatchObject({ version: STORAGE_VERSION, savedAt: '2026-02-06T00:00:00.000Z' })
    expect(env.calls).toHaveLength(1)
  })
})

describe('mergeCalls', () => {
  it('RESCUED durumu kazanır, OPEN geri yazmaz', () => {
    const rescued = { ...a, status: 'RESCUED' as const }
    expect(mergeCalls([a], [rescued])[0].status).toBe('RESCUED')
    expect(mergeCalls([rescued], [a])[0].status).toBe('RESCUED')
    expect(mergeCalls([a], [b]).map((c) => c.id)).toEqual(['A', 'B'])
  })
})

describe('load/save', () => {
  it('bellek deposunda gidiş-dönüş', () => {
    const store = createMemoryStore()
    expect(saveCalls(KEYS.outbox, [a, b], store)).toBe(true)
    expect(loadCalls(KEYS.outbox, store)).toEqual([a, b])
    store.removeItem(KEYS.outbox)
    expect(loadCalls(KEYS.outbox, store)).toEqual([])
    expect(Object.keys(store.dump())).toEqual([])
  })

  it('depo yoksa güvenli davranır', () => {
    expect(loadCalls(KEYS.outbox, undefined)).toEqual([])
    expect(saveCalls(KEYS.outbox, [a], undefined)).toBe(false)
  })

  it('kota hatasında false döner, okuma hatasında [] döner', () => {
    const broken: KVStore = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    }
    expect(saveCalls(KEYS.outbox, [a], broken)).toBe(false)
    expect(loadCalls(KEYS.outbox, broken)).toEqual([])
  })

  it('başlangıç verisiyle bellek deposu', () => {
    const store = createMemoryStore({ [KEYS.received]: serializeCalls([b]) })
    expect(loadCalls(KEYS.received, store)).toEqual([b])
  })
})

describe('safeLocalStorage', () => {
  it('tarayıcı localStorage döner', () => expect(safeLocalStorage()).toBe(window.localStorage))
  it('erişim engellenirse undefined döner (gizli mod)', () => {
    expect(
      safeLocalStorage(() => {
        throw new Error('blocked')
      }),
    ).toBeUndefined()
  })
})
