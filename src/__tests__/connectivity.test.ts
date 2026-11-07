import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchEmergency, TimeoutError, withTimeout } from '../lib/connectivity'
import { createDemoNetwork, RESCUE_NODE_ID } from '../lib/mesh'
import type { MeshMessage } from '../lib/mesh'
import type { EmergencyCall } from '../types'
import { makeCall } from '../test/factories'

function fakeMesh() {
  return {
    originate: vi.fn((_node: string, call: EmergencyCall): MeshMessage => ({ id: call.id, payload: call, ttl: 8, hops: ['N1'] })),
  }
}

describe('withTimeout', () => {
  afterEach(() => vi.useRealTimers())

  it('zamanında çözülen sözü geçirir', async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7)
  })

  it('süre aşılırsa TimeoutError fırlatır', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => undefined), 300)
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(300)
    await assertion
  })
})

describe('dispatchEmergency', () => {
  afterEach(() => vi.useRealTimers())
  const call = makeCall({ id: 'C-NET' })

  it('internet varsa sunucuya gönderir, mesh kullanmaz', async () => {
    const mesh = fakeMesh()
    const post = vi.fn().mockResolvedValue(undefined)
    const r = await dispatchEmergency(call, 'N1', { isOnline: () => true, postToServer: post, mesh })
    expect(r).toEqual({ channel: 'internet' })
    expect(post).toHaveBeenCalledWith(call)
    expect(mesh.originate).not.toHaveBeenCalled()
  })

  it('SİMÜLASYON: GSM/internet kesik → doğrudan mesh', async () => {
    const mesh = fakeMesh()
    const post = vi.fn()
    const r = await dispatchEmergency(call, 'N1', { isOnline: () => false, postToServer: post, mesh })
    expect(r).toEqual({ channel: 'mesh', fallbackReason: 'offline', messageId: 'C-NET' })
    expect(post).not.toHaveBeenCalled()
    expect(mesh.originate).toHaveBeenCalledWith('N1', call)
  })

  it('SİMÜLASYON: sunucu çöktü (5xx) → mesh yedeği', async () => {
    const mesh = fakeMesh()
    const post = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'))
    const r = await dispatchEmergency(call, 'N1', { isOnline: () => true, postToServer: post, mesh })
    expect(r).toMatchObject({ channel: 'mesh', fallbackReason: 'server_error' })
    expect(mesh.originate).toHaveBeenCalledTimes(1)
  })

  it('SİMÜLASYON: baz istasyonu yanıt vermiyor (zaman aşımı) → mesh yedeği', async () => {
    vi.useFakeTimers()
    const mesh = fakeMesh()
    const post = vi.fn(() => new Promise<void>(() => undefined))
    const p = dispatchEmergency(call, 'N1', { isOnline: () => true, postToServer: post, mesh, timeoutMs: 2000 })
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toMatchObject({ channel: 'mesh', fallbackReason: 'timeout' })
  })

  it('varsayılan zaman aşımı 5 sn', async () => {
    vi.useFakeTimers()
    const mesh = fakeMesh()
    const p = dispatchEmergency(call, 'N1', { isOnline: () => true, postToServer: () => new Promise(() => undefined), mesh })
    await vi.advanceTimersByTimeAsync(4999)
    expect(mesh.originate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toMatchObject({ fallbackReason: 'timeout' })
  })

  it('sunucu tanımlı değilse çevrimiçi olsa da mesh kullanılır', async () => {
    const mesh = fakeMesh()
    const r = await dispatchEmergency(call, 'N1', { isOnline: () => true, mesh })
    expect(r.channel).toBe('mesh')
  })

  it('UÇTAN UCA kesinti: gerçek mesh, aktarıcılar kapalı → bekler → toparlanınca ulaşır', async () => {
    const mesh = createDemoNetwork()
    mesh.setOnline('N3', false)
    mesh.setOnline('N4', false)
    const r = await dispatchEmergency(call, 'N1', { isOnline: () => false, mesh })
    expect(r.channel).toBe('mesh')
    expect(mesh.inbox(RESCUE_NODE_ID)).toHaveLength(0)
    expect(mesh.pendingCount()).toBeGreaterThan(0)

    mesh.setOnline('N4', true)
    expect(mesh.inbox(RESCUE_NODE_ID)).toHaveLength(1)
    expect(mesh.inbox(RESCUE_NODE_ID)[0].hops).toEqual(['N1', 'N2', 'N4', 'N5', RESCUE_NODE_ID])
  })
})
