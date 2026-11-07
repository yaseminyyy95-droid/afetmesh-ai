import type { EmergencyCall } from '../types'
import type { BeaconInput } from '../lib/validation'

export const T0 = '2026-02-06T05:30:00.000Z'
export const NOW = new Date('2026-02-06T06:00:00.000Z')

export function makeCall(over: Partial<EmergencyCall> = {}): EmergencyCall {
  return {
    id: 'CALL-TEST',
    createdAt: T0,
    deviceId: 'N1',
    lat: 37.5753,
    lng: 36.9228,
    locationNote: '',
    debrisStatus: 'FREE',
    bloodType: 'UNKNOWN',
    peopleCount: 1,
    injuredCount: 0,
    hasChildren: false,
    hasElderly: false,
    canCommunicate: true,
    narrative: '',
    status: 'OPEN',
    ...over,
  }
}

export function makeInput(over: Partial<BeaconInput> = {}): BeaconInput {
  return {
    deviceId: 'N1',
    lat: '37.5753',
    lng: '36.9228',
    locationNote: 'Ebrar Sitesi B blok',
    debrisStatus: 'TRAPPED',
    bloodType: '0+',
    peopleCount: '2',
    injuredCount: '1',
    hasChildren: false,
    hasElderly: true,
    canCommunicate: true,
    narrative: 'annem nefes almakta zorlanıyor',
    ...over,
  }
}
