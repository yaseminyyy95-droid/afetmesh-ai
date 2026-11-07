import { describe, expect, it } from 'vitest'
import { LIMITS, parseNumber, validateBeacon } from '../lib/validation'
import { createCall, generateId } from '../lib/call'
import { makeInput } from '../test/factories'

describe('parseNumber', () => {
  it('ondalık virgülü kabul eder', () => expect(parseNumber('37,5')).toBe(37.5))
  it('boş metin NaN', () => expect(parseNumber('  ')).toBeNaN())
  it('null güvenli', () => expect(parseNumber(null as unknown as string)).toBeNaN())
})

describe('validateBeacon', () => {
  it('geçerli girdiyi sayılara çevirir', () => {
    const r = validateBeacon(makeInput({ lat: ' 37,5753 ', locationNote: '  B blok  ' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lat).toBe(37.5753)
      expect(r.value.peopleCount).toBe(2)
      expect(r.value.locationNote).toBe('B blok')
    }
  })

  it('uzun metinleri kırpar', () => {
    const r = validateBeacon(makeInput({ narrative: 'a'.repeat(900), locationNote: 'b'.repeat(900) }))
    expect(r.ok && r.value.narrative.length).toBe(LIMITS.NARRATIVE)
    expect(r.ok && r.value.locationNote.length).toBe(LIMITS.LOCATION_NOTE)
  })

  it.each([
    [{ deviceId: ' ' }, 'deviceId', 'err.device'],
    [{ lat: '' }, 'lat', 'err.lat'],
    [{ lat: '91' }, 'lat', 'err.lat'],
    [{ lng: 'abc' }, 'lng', 'err.lng'],
    [{ lng: '-181' }, 'lng', 'err.lng'],
    [{ debrisStatus: 'MAYBE' }, 'debrisStatus', 'err.debris'],
    [{ bloodType: 'C+' }, 'bloodType', 'err.blood'],
    [{ peopleCount: '0' }, 'peopleCount', 'err.people'],
    [{ peopleCount: '2.5' }, 'peopleCount', 'err.people'],
    [{ peopleCount: '51' }, 'peopleCount', 'err.people'],
    [{ injuredCount: '-1' }, 'injuredCount', 'err.injured'],
    [{ injuredCount: '3', peopleCount: '2' }, 'injuredCount', 'err.injured'],
  ] as const)('%o → %s hatası', (over, field, key) => {
    const r = validateBeacon(makeInput(over))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[field]).toBe(key)
  })

  it('kişi sayısı geçersizken yaralı sayısını kişi sayısına göre kıyaslamaz', () => {
    const r = validateBeacon(makeInput({ peopleCount: 'x', injuredCount: '4' }))
    expect(!r.ok && r.errors.injuredCount).toBeUndefined()
  })
})

describe('call factory', () => {
  it('generateId crypto.randomUUID kullanır', () => {
    const id = generateId('CALL', { randomUUID: () => 'abcdef12-3456-7890-abcd-ef1234567890' })
    expect(id).toBe('CALL-ABCDEF123456')
  })

  it('generateId crypto yoksa yedek üretir', () => {
    // undefined geçmek varsayılan parametreyi tetikler, bu yüzden randomUUID'siz bir nesne verilir.
    const noUuid = {} as Pick<Crypto, 'randomUUID'>
    expect(generateId('X', noUuid)).toMatch(/^X-[A-Z0-9]{1,12}$/)
  })

  it('generateId varsayılan olarak global crypto kullanır', () => {
    expect(generateId()).toMatch(/^CALL-[A-F0-9]{12}$/)
  })

  it('createCall OPEN durumunda ve ISO tarihli çağrı üretir', () => {
    const r = validateBeacon(makeInput())
    if (!r.ok) throw new Error('beklenmedik')
    const call = createCall(r.value, new Date('2026-02-06T04:17:00Z'), 'CALL-1')
    expect(call).toMatchObject({ id: 'CALL-1', status: 'OPEN', createdAt: '2026-02-06T04:17:00.000Z', deviceId: 'N1' })
    expect(createCall(r.value).id).toMatch(/^CALL-/)
  })
})
