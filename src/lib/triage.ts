import type { EmergencyCall, TriageLevel, TriageReason, TriageResult, TriagedCall } from '../types'
import { extractFlags } from './narrative'

export const THRESHOLDS = { RED: 60, YELLOW: 30 } as const

export const WEIGHTS = {
  TRAPPED: 40,
  PARTIAL: 25,
  INJURED_BASE: 10,
  INJURED_PER_PERSON: 3,
  INJURED_CAP: 5,
  CRITICAL_PER_TERM: 20,
  CRITICAL_CAP: 2,
  MEDICAL: 10,
  PREGNANCY: 8,
  CHILD: 8,
  ELDERLY: 8,
  NO_RESPONSE: 10,
  PEOPLE_PER_PERSON: 2,
  PEOPLE_MIN: 3,
  PEOPLE_CAP: 10,
  TIME_MAX: 15,
  TIME_WINDOW_HOURS: 72,
} as const

export function levelFromScore(score: number): TriageLevel {
  if (score >= THRESHOLDS.RED) return 'RED'
  if (score >= THRESHOLDS.YELLOW) return 'YELLOW'
  return 'GREEN'
}

export function hoursSince(createdAt: string, now: Date): number {
  const hours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000
  return Number.isFinite(hours) ? Math.max(0, hours) : 0
}

/**
 * Kural tabanlı önceliklendirme. Skor 0-100 aralığına kırpılır.
 * Karar destek önerisidir, tıbbi triyajın yerine geçmez.
 */
export function triageCall(call: EmergencyCall, now: Date = new Date()): TriageResult {
  const W = WEIGHTS
  const reasons: TriageReason[] = []
  let score = 0

  if (call.debrisStatus === 'TRAPPED') {
    score += W.TRAPPED
    reasons.push('TRAPPED')
  } else if (call.debrisStatus === 'PARTIAL') {
    score += W.PARTIAL
    reasons.push('PARTIAL')
  }

  if (call.injuredCount > 0) {
    score += W.INJURED_BASE + Math.min(call.injuredCount, W.INJURED_CAP) * W.INJURED_PER_PERSON
    reasons.push('INJURED')
  }

  const nl = extractFlags(call.narrative)
  if (nl.critical > 0) {
    score += Math.min(nl.critical, W.CRITICAL_CAP) * W.CRITICAL_PER_TERM
    reasons.push('CRITICAL_SYMPTOM')
  }
  if (nl.medical) {
    score += W.MEDICAL
    reasons.push('MEDICAL_DEPENDENCY')
  }
  if (nl.pregnancy) {
    score += W.PREGNANCY
    reasons.push('PREGNANCY')
  }

  if (call.hasChildren || call.hasElderly) {
    score += (call.hasChildren ? W.CHILD : 0) + (call.hasElderly ? W.ELDERLY : 0)
    reasons.push('VULNERABLE')
  }

  if (!call.canCommunicate) {
    score += W.NO_RESPONSE
    reasons.push('NO_RESPONSE')
  }

  if (call.peopleCount >= W.PEOPLE_MIN) {
    score += Math.min(call.peopleCount, W.PEOPLE_CAP) * W.PEOPLE_PER_PERSON
    reasons.push('MANY_PEOPLE')
  }

  const hours = hoursSince(call.createdAt, now)
  if (hours >= 1) {
    score += Math.round((Math.min(hours, W.TIME_WINDOW_HOURS) / W.TIME_WINDOW_HOURS) * W.TIME_MAX)
    reasons.push('TIME_ELAPSED')
  }

  const clamped = Math.max(0, Math.min(100, score))
  return { score: clamped, level: levelFromScore(clamped), reasons }
}

const LEVEL_RANK: Record<TriageLevel, number> = { RED: 0, YELLOW: 1, GREEN: 2 }

/** Açık çağrılar önce. Sonra seviye, skor (azalan) ve eski çağrı önce. */
export function sortByPriority(calls: EmergencyCall[], now: Date = new Date()): TriagedCall[] {
  return calls
    .map((c) => ({ ...c, triage: triageCall(c, now) }))
    .sort((a, b) => {
      const rescued = Number(a.status === 'RESCUED') - Number(b.status === 'RESCUED')
      if (rescued !== 0) return rescued
      const level = LEVEL_RANK[a.triage.level] - LEVEL_RANK[b.triage.level]
      if (level !== 0) return level
      if (b.triage.score !== a.triage.score) return b.triage.score - a.triage.score
      return a.createdAt.localeCompare(b.createdAt)
    })
}

export interface TriageSummary {
  RED: number
  YELLOW: number
  GREEN: number
  RESCUED: number
  total: number
}

export function summarize(calls: TriagedCall[]): TriageSummary {
  const s: TriageSummary = { RED: 0, YELLOW: 0, GREEN: 0, RESCUED: 0, total: calls.length }
  for (const c of calls) {
    if (c.status === 'RESCUED') s.RESCUED++
    else s[c.triage.level]++
  }
  return s
}
