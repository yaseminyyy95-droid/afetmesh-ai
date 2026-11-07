import { afterEach, describe, expect, it, vi } from 'vitest'
import { CSV_COLUMNS, downloadText, escapeCsv, EXPORT_SCHEMA, exportFilename, toAfadJson, toCsv } from '../lib/export'
import { sortByPriority } from '../lib/triage'
import { makeCall, NOW } from '../test/factories'

const calls = sortByPriority(
  [
    makeCall({ id: 'A', debrisStatus: 'TRAPPED', narrative: 'nefes alamıyor, "acil"', hops: ['N1', 'N2', 'RESCUE-1'], bloodType: '0-' }),
    makeCall({ id: 'B', locationNote: 'Cumhuriyet Mah., 5. sokak' }),
  ],
  NOW,
)

describe('toAfadJson', () => {
  it('şema, sayaç ve alan eşlemesi', () => {
    const doc = JSON.parse(toAfadJson(calls, NOW))
    expect(doc).toMatchObject({ schema: EXPORT_SCHEMA, source: 'AfetMesh AI', exportedAt: NOW.toISOString(), count: 2 })
    expect(doc.calls[0]).toMatchObject({
      id: 'A',
      location: { lat: 37.5753, lng: 36.9228 },
      bloodType: '0-',
      triage: { level: 'RED', score: 60 },
      relay: { originDevice: 'N1', hopCount: 2 },
    })
    expect(doc.calls[1].relay).toEqual({ originDevice: 'N1', hops: [], hopCount: 0 })
  })

  it('tarih verilmezse güncel zamanı yazar', () => {
    expect(JSON.parse(toAfadJson([])).count).toBe(0)
  })
})

describe('CSV', () => {
  it('escapeCsv özel karakterleri tırnaklar', () => {
    expect(escapeCsv('düz')).toBe('düz')
    expect(escapeCsv('a,b')).toBe('"a,b"')
    expect(escapeCsv('a;b')).toBe('"a;b"')
    expect(escapeCsv('a "b"')).toBe('"a ""b"""')
    expect(escapeCsv('a\nb')).toBe('"a\nb"')
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(undefined)).toBe('')
    expect(escapeCsv(42)).toBe('42')
  })

  it('BOM, başlık ve satırlar', () => {
    const csv = toCsv(calls)
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('A,2026-02-06T05:30:00.000Z,OPEN,RED,60,TRAPPED|CRITICAL_SYMPTOM')
    expect(lines[1]).toContain('"nefes alamıyor, ""acil"""')
    expect(lines[2]).toContain('"Cumhuriyet Mah., 5. sokak"')
  })
})

describe('exportFilename', () => {
  it('dosya adında iki nokta üst üste yok', () => {
    expect(exportFilename('csv', new Date('2026-02-06T04:17:00Z'))).toBe('afetmesh_cagrilar_2026-02-06T04-17.csv')
    expect(exportFilename('json')).toMatch(/\.json$/)
  })
})

describe('downloadText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('blob URL oluşturur, tıklar ve temizler', () => {
    const create = vi.fn(() => 'blob:mock')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    downloadText('x.json', '{}', 'application/json')

    expect(create).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:mock')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
