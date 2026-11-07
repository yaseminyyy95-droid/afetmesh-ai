import type { EmergencyCall } from '../types'
import { isEmergencyCall } from './storage'

export interface ChannelLike {
  postMessage(message: unknown): void
  close(): void
  onmessage: ((event: { data: unknown }) => void) | null
}
export type ChannelCtor = new (name: string) => ChannelLike

export interface TabBridge {
  publish(call: EmergencyCall): boolean
  close(): void
}

export const CHANNEL_NAME = 'afetmesh-ai'

/**
 * Aynı cihazdaki sekmeler arasında çağrıları senkronlar (BroadcastChannel).
 * Sunucu gerektirmez, internet yokken de çalışır.
 */
export function createTabBridge(onCall: (call: EmergencyCall) => void, Ctor: ChannelCtor | null | undefined): TabBridge {
  if (!Ctor) return { publish: () => false, close: () => undefined }
  const channel = new Ctor(CHANNEL_NAME)
  channel.onmessage = (event) => {
    const data = event.data as { type?: string; call?: unknown } | null
    if (data && data.type === 'call' && isEmergencyCall(data.call)) onCall(data.call)
  }
  return {
    publish(call) {
      // Kapalı kanal ya da kopyalanamayan veri asıl akışı (mesh aktarımı) düşürmemeli.
      try {
        channel.postMessage({ type: 'call', call })
        return true
      } catch {
        return false
      }
    },
    close() {
      channel.onmessage = null
      channel.close()
    },
  }
}

export function defaultChannelCtor(): ChannelCtor | null {
  return typeof BroadcastChannel === 'undefined' ? null : (BroadcastChannel as unknown as ChannelCtor)
}
