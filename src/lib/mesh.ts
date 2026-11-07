import type { EmergencyCall } from '../types'

export type NodeKind = 'citizen' | 'rescue'

export interface MeshNode {
  id: string
  label: string
  kind: NodeKind
  online: boolean
  x: number
  y: number
}

export interface MeshMessage {
  id: string
  payload: EmergencyCall
  ttl: number
  hops: string[]
}

export type MeshEventType = 'originated' | 'relayed' | 'delivered' | 'queued' | 'duplicate' | 'ttl_expired' | 'status'

export interface MeshEvent {
  type: MeshEventType
  nodeId: string
  peerId?: string
  messageId?: string
  message?: MeshMessage
  online?: boolean
  isRescue?: boolean
  at: number
}

export type MeshListener = (event: MeshEvent) => void

interface NodeState extends MeshNode {
  inbox: Map<string, MeshMessage>
  sentTo: Map<string, Set<string>>
  expired: Set<string>
}

export type NewNode = Pick<MeshNode, 'id' | 'label' | 'kind'> & Partial<Pick<MeshNode, 'online' | 'x' | 'y'>>

/**
 * Bellek içi mesh simülatörü (olay veriyolu).
 * - Flooding + TTL ile çok atlamalı aktarım
 * - Mesaj kimliğiyle tekrar engelleme
 * - Sakla-ilet: alıcı kapalıysa mesaj bekletilir, açılınca iletilir
 * Taşıma katmanı soyuttur. WebRTC veya BLE gibi gerçek bir taşıyıcı bu sınıfın
 * aktarım mantığına bağlanabilir. Bu sürümde gerçek radyo/WebRTC taşıyıcısı yoktur.
 */
export class MeshNetwork {
  private nodes = new Map<string, NodeState>()
  private links = new Map<string, Set<string>>()
  private listeners = new Set<MeshListener>()
  private queued = new Set<string>()

  constructor(
    private readonly clock: () => number = Date.now,
    readonly defaultTtl = 8,
  ) {}

  addNode(node: NewNode): this {
    if (this.nodes.has(node.id)) throw new Error(`Node already exists: ${node.id}`)
    this.nodes.set(node.id, {
      online: true,
      x: 0,
      y: 0,
      ...node,
      inbox: new Map(),
      sentTo: new Map(),
      expired: new Set(),
    })
    this.links.set(node.id, new Set())
    return this
  }

  connect(a: string, b: string): this {
    this.require(a)
    this.require(b)
    if (a === b) throw new Error('A node cannot link to itself')
    this.links.get(a)!.add(b)
    this.links.get(b)!.add(a)
    this.flush()
    return this
  }

  disconnect(a: string, b: string): this {
    this.links.get(a)?.delete(b)
    this.links.get(b)?.delete(a)
    return this
  }

  getNodes(): MeshNode[] {
    return [...this.nodes.values()].map(({ id, label, kind, online, x, y }) => ({ id, label, kind, online, x, y }))
  }

  getNode(id: string): MeshNode | undefined {
    return this.getNodes().find((n) => n.id === id)
  }

  getLinks(): [string, string][] {
    const out: [string, string][] = []
    for (const [a, set] of this.links) for (const b of set) if (a < b) out.push([a, b])
    return out
  }

  neighbors(id: string): string[] {
    return [...(this.links.get(id) ?? [])]
  }

  inbox(id: string): MeshMessage[] {
    return [...(this.nodes.get(id)?.inbox.values() ?? [])]
  }

  rescueNodeIds(): string[] {
    return [...this.nodes.values()].filter((n) => n.kind === 'rescue').map((n) => n.id)
  }

  pendingCount(): number {
    return this.queued.size
  }

  subscribe(listener: MeshListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setOnline(id: string, online: boolean): void {
    const node = this.require(id)
    if (node.online === online) return
    node.online = online
    this.emit({ type: 'status', nodeId: id, online })
    if (online) this.flush()
  }

  originate(nodeId: string, payload: EmergencyCall, ttl: number = this.defaultTtl): MeshMessage {
    const node = this.require(nodeId)
    const msg: MeshMessage = { id: payload.id, payload, ttl, hops: [nodeId] }
    node.inbox.set(msg.id, msg)
    this.emit({ type: 'originated', nodeId, messageId: msg.id, message: msg })
    this.forward(nodeId, msg)
    return msg
  }

  private require(id: string): NodeState {
    const node = this.nodes.get(id)
    if (!node) throw new Error(`Unknown node: ${id}`)
    return node
  }

  private emit(event: Omit<MeshEvent, 'at'>): void {
    const full: MeshEvent = { ...event, at: this.clock() }
    for (const l of this.listeners) {
      // Bir dinleyicinin (ör. arayüz) hatası mesajın diğer cihazlara aktarımını durdurmamalı.
      try {
        l(full)
      } catch (err) {
        console.error('[mesh] listener failed', err)
      }
    }
  }

  private flush(): void {
    for (const node of this.nodes.values()) {
      for (const msg of node.inbox.values()) this.forward(node.id, msg)
    }
  }

  private forward(nodeId: string, msg: MeshMessage): void {
    const node = this.require(nodeId)
    if (msg.ttl <= 0) {
      if (!node.expired.has(msg.id)) {
        node.expired.add(msg.id)
        this.emit({ type: 'ttl_expired', nodeId, messageId: msg.id })
      }
      return
    }
    let sent = node.sentTo.get(msg.id)
    if (!sent) {
      sent = new Set()
      node.sentTo.set(msg.id, sent)
    }
    for (const peerId of this.links.get(nodeId) ?? []) {
      if (sent.has(peerId)) continue
      const peer = this.require(peerId)
      const key = `${nodeId}>${peerId}:${msg.id}`
      if (!node.online || !peer.online) {
        if (!this.queued.has(key)) {
          this.queued.add(key)
          this.emit({ type: 'queued', nodeId, peerId, messageId: msg.id })
        }
        continue
      }
      this.queued.delete(key)
      sent.add(peerId)
      this.emit({ type: 'relayed', nodeId, peerId, messageId: msg.id })
      this.receive(peerId, { ...msg, ttl: msg.ttl - 1, hops: [...msg.hops, peerId] })
    }
  }

  private receive(nodeId: string, msg: MeshMessage): void {
    const node = this.require(nodeId)
    if (node.inbox.has(msg.id)) {
      this.emit({ type: 'duplicate', nodeId, messageId: msg.id })
      return
    }
    node.inbox.set(msg.id, msg)
    this.emit({ type: 'delivered', nodeId, messageId: msg.id, message: msg, isRescue: node.kind === 'rescue' })
    this.forward(nodeId, msg)
  }
}

export const RESCUE_NODE_ID = 'RESCUE-1'

/**
 * Demo topolojisi. Kurtarma ekibine iki bağımsız yoldan ulaşılır:
 *   N1 - N2 - N3 - RESCUE-1
 *         |          |
 *        N4 ------ N5
 */
export function createDemoNetwork(clock?: () => number): MeshNetwork {
  return new MeshNetwork(clock)
    .addNode({ id: 'N1', label: 'Tel-1 (enkaz)', kind: 'citizen', x: 50, y: 60 })
    .addNode({ id: 'N2', label: 'Tel-2 (komşu)', kind: 'citizen', x: 160, y: 60 })
    .addNode({ id: 'N3', label: 'Tel-3 (sokak)', kind: 'citizen', x: 270, y: 60 })
    .addNode({ id: 'N4', label: 'Tel-4 (park)', kind: 'citizen', x: 160, y: 170 })
    .addNode({ id: 'N5', label: 'Tel-5 (toplanma alanı)', kind: 'citizen', x: 270, y: 170 })
    .addNode({ id: RESCUE_NODE_ID, label: 'Kurtarma Ekibi', kind: 'rescue', x: 380, y: 115 })
    .connect('N1', 'N2')
    .connect('N2', 'N3')
    .connect('N3', RESCUE_NODE_ID)
    .connect('N2', 'N4')
    .connect('N4', 'N5')
    .connect('N5', RESCUE_NODE_ID)
}
