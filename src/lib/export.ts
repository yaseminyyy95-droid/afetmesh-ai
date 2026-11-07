import type { TriagedCall } from '../types'

export const EXPORT_SCHEMA = 'afetmesh.call-export.v1'

function hopCount(c: TriagedCall): number {
  return Math.max(0, (c.hops?.length ?? 1) - 1)
}

/**
 * AFAD/AKUT ekiplerine aktarım için önerilen alan şeması.
 * Resmî bir AFAD/AKUT formatı değildir. Kurumla entegrasyon öncesi alan eşlemesi gerekir.
 */
export function toAfadJson(calls: TriagedCall[], now: Date = new Date()): string {
  return JSON.stringify(
    {
      schema: EXPORT_SCHEMA,
      source: 'AfetMesh AI',
      exportedAt: now.toISOString(),
      count: calls.length,
      calls: calls.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        status: c.status,
        location: { lat: c.lat, lng: c.lng, note: c.locationNote },
        debrisStatus: c.debrisStatus,
        bloodType: c.bloodType,
        peopleCount: c.peopleCount,
        injuredCount: c.injuredCount,
        vulnerable: { children: c.hasChildren, elderly: c.hasElderly },
        canCommunicate: c.canCommunicate,
        narrative: c.narrative,
        triage: c.triage,
        relay: { originDevice: c.deviceId, hops: c.hops ?? [], hopCount: hopCount(c) },
      })),
    },
    null,
    2,
  )
}

export const CSV_COLUMNS = [
  'id',
  'createdAt',
  'status',
  'triageLevel',
  'triageScore',
  'triageReasons',
  'lat',
  'lng',
  'locationNote',
  'debrisStatus',
  'bloodType',
  'peopleCount',
  'injuredCount',
  'hasChildren',
  'hasElderly',
  'canCommunicate',
  'narrative',
  'originDevice',
  'hopCount',
] as const

export function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Excel'de Türkçe karakterlerin doğru görünmesi için UTF-8 BOM eklenir. */
export function toCsv(calls: TriagedCall[]): string {
  const rows = calls.map((c) =>
    [
      c.id,
      c.createdAt,
      c.status,
      c.triage.level,
      c.triage.score,
      c.triage.reasons.join('|'),
      c.lat,
      c.lng,
      c.locationNote,
      c.debrisStatus,
      c.bloodType,
      c.peopleCount,
      c.injuredCount,
      c.hasChildren,
      c.hasElderly,
      c.canCommunicate,
      c.narrative,
      c.deviceId,
      hopCount(c),
    ]
      .map(escapeCsv)
      .join(','),
  )
  return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n')
}

export function exportFilename(kind: 'json' | 'csv', now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/:/g, '-')
  return `afetmesh_cagrilar_${stamp}.${kind}`
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
