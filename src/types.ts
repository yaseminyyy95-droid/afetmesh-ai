export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | '0+' | '0-' | 'UNKNOWN'
export const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-', 'UNKNOWN']

export type DebrisStatus = 'TRAPPED' | 'PARTIAL' | 'FREE'
export const DEBRIS_STATUSES: DebrisStatus[] = ['TRAPPED', 'PARTIAL', 'FREE']

export type TriageLevel = 'RED' | 'YELLOW' | 'GREEN'
export type CallStatus = 'OPEN' | 'RESCUED'
export type Lang = 'tr' | 'en'

export interface EmergencyCall {
  id: string
  createdAt: string
  deviceId: string
  lat: number
  lng: number
  locationNote: string
  debrisStatus: DebrisStatus
  bloodType: BloodType
  peopleCount: number
  injuredCount: number
  hasChildren: boolean
  hasElderly: boolean
  canCommunicate: boolean
  narrative: string
  status: CallStatus
  hops?: string[]
}

export type TriageReason =
  | 'TRAPPED'
  | 'PARTIAL'
  | 'INJURED'
  | 'CRITICAL_SYMPTOM'
  | 'MEDICAL_DEPENDENCY'
  | 'PREGNANCY'
  | 'VULNERABLE'
  | 'NO_RESPONSE'
  | 'MANY_PEOPLE'
  | 'TIME_ELAPSED'

export interface TriageResult {
  score: number
  level: TriageLevel
  reasons: TriageReason[]
}

export interface TriagedCall extends EmergencyCall {
  triage: TriageResult
}
