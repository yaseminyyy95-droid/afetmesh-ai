import type { EmergencyCall } from '../types'
import type { BeaconValue } from './validation'

export function generateId(prefix = 'CALL', cryptoImpl: Pick<Crypto, 'randomUUID'> | undefined = globalThis.crypto): string {
  const rnd =
    cryptoImpl && typeof cryptoImpl.randomUUID === 'function'
      ? cryptoImpl.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}-${rnd.slice(0, 12).toUpperCase()}`
}

export function createCall(value: BeaconValue, now: Date = new Date(), id: string = generateId()): EmergencyCall {
  return { ...value, id, createdAt: now.toISOString(), status: 'OPEN' }
}
