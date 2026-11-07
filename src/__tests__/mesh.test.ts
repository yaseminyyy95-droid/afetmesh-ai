import { describe, expect, it, vi } from 'vitest'
import { createDemoNetwork, MeshNetwork, RESCUE_NODE_ID } from '../lib/mesh'
import type { MeshEvent } from '../lib/mesh'
import { makeCall } from '../test/factories'

function record(net: MeshNetwork) {
  const events: MeshEvent[] = []
  net.subscribe((e) => events.push(e))
  return events
}
const ofType = (events: MeshEvent[], type: MeshEvent['type']) => events.filter((e) => e.type === type)

describe('MeshNetwork: topoloji', () => {
  it('demo ağı 6 düğüm, 6 bağlantı ve 1 kurtarma düğümü içerir', () => {
    const net = createDemoNetwork()
    expect(net.getNodes()).toHaveLength(6)
    expect(net.getLinks()).toHaveLength(6)
    expect(net.rescueNodeIds()).toEqual([RESCUE_NODE_ID])
    expect(net.neighbors('N2').sort()).toEqual(['N1', 'N3', 'N4'])
    expect(net.getNode('N1')).toMatchObject({ kind: 'citizen', online: true })
    expect(net.getNode('YOK')).toBeUndefined()
    expect(net.neighbors('YOK')).toEqual([])
    expect(net.inbox('YOK')).toEqual([])
  })

  it('hatalı işlemlerde açık hata verir', () => {
    const net = new MeshNetwork().addNode({ id: 'A', label: 'A', kind: 'citizen' })
    expect(() => net.addNode({ id: 'A', label: 'A', kind: 'citizen' })).toThrow(/already exists/)
    expect(() => net.connect('A', 'B')).toThrow(/Unknown node/)
    expect(() => net.connect('A', 'A')).toThrow(/itself/)
    expect(() => net.setOnline('B', true)).toThrow(/Unknown node/)
    expect(() => net.originate('B', makeCall())).toThrow(/Unknown node/)
  })

  it('disconnect bağlantıyı kaldırır', () => {
    const net = createDemoNetwork().disconnect('N1', 'N2')
    expect(net.neighbors('N1')).toEqual([])
    expect(net.disconnect('YOK', 'N1')).toBe(net)
  })
})

describe('MeshNetwork: aktarım', () => {
  it('çağrı çok atlamayla kurtarma ekibine ulaşır', () => {
    const net = createDemoNetwork(() => 1000)
    const events = record(net)
    const msg = net.originate('N1', makeCall({ id: 'C1' }))
    expect(msg).toMatchObject({ id: 'C1', ttl: 8, hops: ['N1'] })

    const inbox = net.inbox(RESCUE_NODE_ID)
    expect(inbox).toHaveLength(1)
    expect(inbox[0].hops[0]).toBe('N1')
    expect(inbox[0].hops[inbox[0].hops.length - 1]).toBe(RESCUE_NODE_ID)
    const rescueDelivery = ofType(events, 'delivered').find((e) => e.nodeId === RESCUE_NODE_ID)
    expect(rescueDelivery).toMatchObject({ isRescue: true, at: 1000 })
    expect(ofType(events, 'originated')).toHaveLength(1)
    // Her düğüm mesajı tam bir kez saklar.
    for (const n of net.getNodes()) expect(net.inbox(n.id)).toHaveLength(1)
  })

  it('iki yoldan gelen kopyalar tekrar engellemeyle elenir', () => {
    const net = createDemoNetwork()
    const events = record(net)
    net.originate('N1', makeCall({ id: 'C2' }))
    expect(ofType(events, 'duplicate').length).toBeGreaterThan(0)
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(1)
  })

  it('TTL dolunca aktarım durur', () => {
    const net = createDemoNetwork()
    const events = record(net)
    net.originate('N1', makeCall({ id: 'C3' }), 1)
    expect(net.inbox('N2')).toHaveLength(1)
    expect(net.inbox('N3')).toHaveLength(0)
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(0)
    expect(ofType(events, 'ttl_expired')).toEqual([expect.objectContaining({ nodeId: 'N2', messageId: 'C3' })])
    // Yeniden flush aynı olayı ikinci kez üretmez.
    net.setOnline('N5', false)
    net.setOnline('N5', true)
    expect(ofType(events, 'ttl_expired')).toHaveLength(1)
  })

  it('aynı duruma setOnline olay üretmez', () => {
    const net = createDemoNetwork()
    const events = record(net)
    net.setOnline('N1', true)
    expect(events).toHaveLength(0)
  })

  it('abonelik iptal edilince olay gelmez', () => {
    const net = createDemoNetwork()
    const listener = vi.fn()
    const off = net.subscribe(listener)
    off()
    net.originate('N1', makeCall())
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('MeshNetwork: ağ kesintisi ve sakla-ilet', () => {
  it('iki aktarıcı kapalıyken çağrı bekletilir, biri açılınca iletilir', () => {
    const net = createDemoNetwork()
    const events = record(net)
    net.setOnline('N3', false)
    net.setOnline('N5', false)

    net.originate('N1', makeCall({ id: 'C4' }))
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(0)
    expect(net.pendingCount()).toBe(2)
    expect(ofType(events, 'queued').map((e) => `${e.nodeId}>${e.peerId}`).sort()).toEqual(['N2>N3', 'N4>N5'])

    net.setOnline('N3', true)
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(1)
    expect(net.inbox(RESCUE_NODE_ID)[0].hops).toEqual(['N1', 'N2', 'N3', RESCUE_NODE_ID])
    // N5 hâlâ kapalı: hem N4 hem kurtarma düğümü ona iletmek için bekliyor.
    expect(net.pendingCount()).toBe(2)
    net.setOnline('N5', true)
    expect(net.pendingCount()).toBe(0)
  })

  it('kaynak cihaz kapalıyken üretilen çağrı cihaz açılınca yayılır', () => {
    const net = createDemoNetwork()
    net.setOnline('N1', false)
    net.originate('N1', makeCall({ id: 'C5' }))
    expect(net.inbox('N2')).toHaveLength(0)
    expect(net.pendingCount()).toBe(1)
    net.setOnline('N1', true)
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(1)
  })

  it('bekleyen mesaj için aynı kuyruk olayı tekrar üretilmez', () => {
    const net = createDemoNetwork()
    const events = record(net)
    net.setOnline('N2', false)
    net.originate('N1', makeCall({ id: 'C6' }))
    net.setOnline('N4', false) // flush tetiklemez (offline)
    net.setOnline('N4', true) // flush tetikler, N2 hâlâ kapalı
    expect(ofType(events, 'queued')).toHaveLength(1)
  })

  it('yeni bağlantı kurulunca bekleyen mesajlar akar', () => {
    const net = new MeshNetwork()
      .addNode({ id: 'A', label: 'A', kind: 'citizen' })
      .addNode({ id: 'R', label: 'R', kind: 'rescue' })
    net.originate('A', makeCall({ id: 'C7' }))
    expect(net.inbox('R')).toHaveLength(0)
    net.connect('A', 'R')
    expect(net.inbox('R')).toHaveLength(1)
  })
})
