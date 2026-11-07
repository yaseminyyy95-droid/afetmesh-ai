import { BLOOD_TYPES, DEBRIS_STATUSES } from '../types'
import type { BloodType, DebrisStatus, EmergencyCall } from '../types'

export interface BeaconInput {
  deviceId: string
  lat: string
  lng: string
  locationNote: string
  debrisStatus: string
  bloodType: string
  peopleCount: string
  injuredCount: string
  hasChildren: boolean
  hasElderly: boolean
  canCommunicate: boolean
  narrative: string
}

export type BeaconValue = Omit<EmergencyCall, 'id' | 'createdAt' | 'status' | 'hops'>
export type BeaconField = 'deviceId' | 'lat' | 'lng' | 'debrisStatus' | 'bloodType' | 'peopleCount' | 'injuredCount'
export type ValidationErrors = Partial<Record<BeaconField, string>>
export type ValidationResult = { ok: true; value: BeaconValue } | { ok: false; errors: ValidationErrors }

export const LIMITS = { MAX_PEOPLE: 50, NARRATIVE: 500, LOCATION_NOTE: 200 } as const

export function parseNumber(raw: string): number {
  const trimmed = (raw ?? '').trim().replace(',', '.')
  if (trimmed === '') return NaN
  return Number(trimmed)
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max
}

export function validateBeacon(input: BeaconInput): ValidationResult {
  const errors: ValidationErrors = {}
  const lat = parseNumber(input.lat)
  const lng = parseNumber(input.lng)
  const people = parseNumber(input.peopleCount)
  const injured = parseNumber(input.injuredCount)

  if (!input.deviceId.trim()) errors.deviceId = 'err.device'
  if (!inRange(lat, -90, 90)) errors.lat = 'err.lat'
  if (!inRange(lng, -180, 180)) errors.lng = 'err.lng'
  if (!DEBRIS_STATUSES.includes(input.debrisStatus as DebrisStatus)) errors.debrisStatus = 'err.debris'
  if (!BLOOD_TYPES.includes(input.bloodType as BloodType)) errors.bloodType = 'err.blood'
  const peopleOk = Number.isInteger(people) && inRange(people, 1, LIMITS.MAX_PEOPLE)
  if (!peopleOk) errors.peopleCount = 'err.people'
  if (!Number.isInteger(injured) || injured < 0 || (peopleOk && injured > people)) errors.injuredCount = 'err.injured'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      deviceId: input.deviceId.trim(),
      lat,
      lng,
      locationNote: input.locationNote.trim().slice(0, LIMITS.LOCATION_NOTE),
      debrisStatus: input.debrisStatus as DebrisStatus,
      bloodType: input.bloodType as BloodType,
      peopleCount: people,
      injuredCount: injured,
      hasChildren: input.hasChildren,
      hasElderly: input.hasElderly,
      canCommunicate: input.canCommunicate,
      narrative: input.narrative.trim().slice(0, LIMITS.NARRATIVE),
    },
  }
}
