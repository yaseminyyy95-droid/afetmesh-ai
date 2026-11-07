import { describe, expect, it, vi } from 'vitest'
import { CHANNEL_NAME, createTabBridge, defaultChannelCtor } from '../lib/tabBridge'
import type { ChannelLike } from '../lib/tabBridge'
import { DICTIONARIES, isLang, t } from '../lib/i18n'
import { appReducer, MAX_EVENTS } from '../state/appReducer'
import type { AppAction, AppState } from '../state/appReducer'
import { makeCall } from '../test/factories'

class FakeChannel implements ChannelLike {
  static last: FakeChannel
  posted: unknown[] = []
  closed = false
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(public name: string) {
    FakeChannel.last = this
  }
  postMessage(m: unknown) {
    this.posted.push(m)
  }
  close() {
    this.closed = true
  }
}

describe('tabBridge (sekmeler arası senkron)', () => {
  it('yayınlar ve geçerli çağrıları alır', () => {
    const onCall = vi.fn()
    const bridge = createTabBridge(onCall, FakeChannel)
    const ch = FakeChannel.last
    expect(ch.name).toBe(CHANNEL_NAME)

    const call = makeCall()
    expect(bridge.publish(call)).toBe(true)
    expect(ch.posted).toEqual([{ type: 'call', call }])

    ch.onmessage!({ data: { type: 'call', call } })
    ch.onmessage!({ data: { type: 'call', call: { id: 'bozuk' } } })
    ch.onmessage!({ data: { type: 'other', call } })
    ch.onmessage!({ data: null })
    expect(onCall).toHaveBeenCalledTimes(1)

    bridge.close()
    expect(ch.closed).toBe(true)
    expect(ch.onmessage).toBeNull()
  })

  it('BroadcastChannel yoksa sessizce devre dışı', () => {
    const bridge = createTabBridge(vi.fn(), null)
    expect(bridge.publish(makeCall())).toBe(false)
    expect(() => bridge.close()).not.toThrow()
  })

  it('defaultChannelCtor ortama göre döner', () => {
    expect(defaultChannelCtor()).toBe(typeof BroadcastChannel === 'undefined' ? null : BroadcastChannel)
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(defaultChannelCtor()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('i18n', () => {
  it('Türkçe ve İngilizce sözlük aynı anahtarlara sahip', () => {
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual(Object.keys(DICTIONARIES.tr).sort())
  })
  it('değişken yerleştirir, bilinmeyen değişkeni olduğu gibi bırakır', () => {
    expect(t('tr', 'dash.people', { count: 3 })).toBe('3 kişi')
    expect(t('en', 'dash.people', { count: 3 })).toBe('3 people')
    expect(t('en', 'dash.people')).toBe('{count} people')
  })
  it('bilinmeyen anahtarda anahtarın kendisi döner', () => {
    expect(t('en', 'yok.boyle.anahtar')).toBe('yok.boyle.anahtar')
  })
  it('isLang', () => {
    expect(isLang('tr')).toBe(true)
    expect(isLang('de')).toBe(false)
    expect(isLang(null)).toBe(false)
  })
})

describe('appReducer', () => {
  const base: AppState = { lang: 'tr', disasterMode: true, received: [], outbox: [], meshEvents: [] }
  const call = makeCall({ id: 'C1' })

  it('dil ve afet modu', () => {
    expect(appReducer(base, { type: 'SET_LANG', lang: 'en' }).lang).toBe('en')
    expect(appReducer(base, { type: 'TOGGLE_DISASTER' }).disasterMode).toBe(false)
  })

  it('RECEIVE_CALL tekrarları yok sayar, kurtarıldı güncellemesini alır', () => {
    const s1 = appReducer(base, { type: 'RECEIVE_CALL', call })
    expect(s1.received).toHaveLength(1)
    expect(appReducer(s1, { type: 'RECEIVE_CALL', call })).toBe(s1)
    const s2 = appReducer(s1, { type: 'RECEIVE_CALL', call: { ...call, status: 'RESCUED' } })
    expect(s2.received[0].status).toBe('RESCUED')
    expect(appReducer(s2, { type: 'RECEIVE_CALL', call: { ...call, status: 'RESCUED' } })).toBe(s2)
  })

  it('ADD_OUTBOX ve MARK_RESCUED', () => {
    expect(appReducer(base, { type: 'ADD_OUTBOX', call }).outbox).toEqual([call])
    const s = appReducer({ ...base, received: [call, makeCall({ id: 'C2' })] }, { type: 'MARK_RESCUED', id: 'C1' })
    expect(s.received.map((c) => c.status)).toEqual(['RESCUED', 'OPEN'])
  })

  it('MESH_EVENT en yeni önde ve üst sınırlı', () => {
    let s = base
    for (let i = 0; i < MAX_EVENTS + 5; i++) s = appReducer(s, { type: 'MESH_EVENT', event: { type: 'status', nodeId: 'N1', at: i } })
    expect(s.meshEvents).toHaveLength(MAX_EVENTS)
    expect(s.meshEvents[0].at).toBe(MAX_EVENTS + 4)
  })

  it('bilinmeyen eylemde durumu değiştirmez', () => {
    expect(appReducer(base, { type: 'NOPE' } as unknown as AppAction)).toBe(base)
  })
})
