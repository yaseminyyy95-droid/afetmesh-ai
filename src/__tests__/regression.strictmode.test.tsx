/**
 * Regresyon: tarayıcıda bulunan hata.
 * React StrictMode efektleri kur-sök-kur yaptığında BroadcastChannel kapanıyor,
 * kapalı kanala yayın InvalidStateError fırlatıp mesh aktarımını ve gönder düğmesini kilitliyordu.
 */
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createDemoNetwork, MeshNetwork, RESCUE_NODE_ID } from '../lib/mesh'
import { createMemoryStore } from '../lib/storage'
import { createTabBridge } from '../lib/tabBridge'
import type { ChannelLike } from '../lib/tabBridge'
import { makeCall } from '../test/factories'

/** Gerçek BroadcastChannel gibi davranır: kapandıktan sonra postMessage hata fırlatır. */
class StrictChannel implements ChannelLike {
  static instances: StrictChannel[] = []
  closed = false
  posted: unknown[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor() {
    StrictChannel.instances.push(this)
  }
  postMessage(m: unknown) {
    if (this.closed) throw new DOMException('Channel is closed', 'InvalidStateError')
    this.posted.push(m)
  }
  close() {
    this.closed = true
  }
}

describe('Regresyon: StrictMode + kapalı BroadcastChannel', () => {
  it('çağrı gönderimi tamamlanır, panel çağrıyı alır ve canlı kanala yayın yapılır', async () => {
    StrictChannel.instances = []
    const user = userEvent.setup()
    render(
      <StrictMode>
        <App mesh={createDemoNetwork()} storage={createMemoryStore()} bridgeCtor={StrictChannel} />
      </StrictMode>,
    )
    await user.type(screen.getByLabelText('Enlem'), '37.5753')
    await user.type(screen.getByLabelText('Boylam'), '36.9228')
    await user.click(screen.getByRole('button', { name: 'ACİL YARDIM ÇAĞRISI GÖNDER' }))

    await within(screen.getByRole('status')).findByText(/mesh ağına bırakıldı/)
    expect(screen.getByRole('button', { name: 'ACİL YARDIM ÇAĞRISI GÖNDER' })).toBeEnabled()

    const live = StrictChannel.instances.filter((c) => !c.closed)
    expect(live).toHaveLength(1)
    expect(live[0].posted).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(screen.getAllByTestId('call-card')).toHaveLength(1)
  })
})

describe('Dayanıklılık', () => {
  it('kapalı kanalda publish false döner, hata fırlatmaz', () => {
    const bridge = createTabBridge(vi.fn(), StrictChannel)
    bridge.close()
    expect(bridge.publish(makeCall())).toBe(false)
  })

  it('hata fırlatan bir dinleyici mesh aktarımını durdurmaz', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const net: MeshNetwork = createDemoNetwork()
    net.subscribe(() => {
      throw new Error('UI çöktü')
    })
    const healthy = vi.fn()
    net.subscribe(healthy)
    net.originate('N1', makeCall({ id: 'C-ROBUST' }))
    expect(net.inbox(RESCUE_NODE_ID)).toHaveLength(1)
    expect(healthy).toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })
})
