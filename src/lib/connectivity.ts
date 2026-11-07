import type { EmergencyCall } from '../types'
import type { MeshNetwork } from './mesh'

export type FallbackReason = 'offline' | 'server_error' | 'timeout'

export interface DispatchResult {
  channel: 'internet' | 'mesh'
  fallbackReason?: FallbackReason
  messageId?: string
}

export interface DispatchDeps {
  isOnline: () => boolean
  postToServer?: (call: EmergencyCall) => Promise<void>
  mesh: Pick<MeshNetwork, 'originate'>
  timeoutMs?: number
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Önce internet (merkezi sunucu) denenir. Bağlantı yoksa, sunucu hata verirse
 * ya da zaman aşımı olursa çağrı mesh ağına bırakılır. Çağrı kaybolmaz.
 */
export async function dispatchEmergency(
  call: EmergencyCall,
  originNodeId: string,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  if (deps.isOnline() && deps.postToServer) {
    try {
      await withTimeout(deps.postToServer(call), deps.timeoutMs ?? 5000)
      return { channel: 'internet' }
    } catch (err) {
      const reason: FallbackReason = err instanceof TimeoutError ? 'timeout' : 'server_error'
      const msg = deps.mesh.originate(originNodeId, call)
      return { channel: 'mesh', fallbackReason: reason, messageId: msg.id }
    }
  }
  const msg = deps.mesh.originate(originNodeId, call)
  return { channel: 'mesh', fallbackReason: 'offline', messageId: msg.id }
}
