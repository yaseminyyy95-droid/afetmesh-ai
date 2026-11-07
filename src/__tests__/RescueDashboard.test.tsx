import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../state/AppContext'
import { RescueDashboard } from '../components/RescueDashboard'
import { createDemoNetwork } from '../lib/mesh'
import { createMemoryStore, KEYS, parseCalls, serializeCalls } from '../lib/storage'
import { makeCall, NOW } from '../test/factories'

const CALLS = [
  makeCall({ id: 'GREEN-1', bloodType: 'A+' }),
  makeCall({ id: 'RED-1', debrisStatus: 'TRAPPED', narrative: 'bilinçsiz', locationNote: 'Hatay, Antakya', hops: ['N1', 'N2', 'N3', 'RESCUE-1'] }),
  makeCall({ id: 'YELLOW-1', debrisStatus: 'PARTIAL', hasElderly: true }),
  makeCall({ id: 'DONE-1', debrisStatus: 'TRAPPED', narrative: 'kanama', status: 'RESCUED' }),
]

function renderDash(calls = CALLS) {
  const storage = createMemoryStore({ [KEYS.received]: serializeCalls(calls) })
  const user = userEvent.setup()
  render(
    <AppProvider mesh={createDemoNetwork()} storage={storage} bridgeCtor={null}>
      <RescueDashboard now={NOW} />
    </AppProvider>,
  )
  return { user, storage }
}

const ids = () => screen.getAllByTestId('call-card').map((c) => within(c).getByText(/-1$/).textContent)

describe('RescueDashboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('çağrıları önceliğe göre sıralar ve özet gösterir', () => {
    renderDash()
    expect(ids()).toEqual(['RED-1', 'YELLOW-1', 'GREEN-1', 'DONE-1'])
    expect(screen.getByTestId('summary-RED')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-YELLOW')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-GREEN')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-RESCUED')).toHaveTextContent('1')
    const red = screen.getAllByTestId('call-card')[0]
    expect(within(red).getByText(/Hatay, Antakya/)).toBeInTheDocument()
    expect(within(red).getByText(/3 atlama/)).toBeInTheDocument()
    expect(within(red).getByText('“bilinçsiz”')).toBeInTheDocument()
    expect(within(screen.getAllByTestId('call-card')[2]).getByText(/Kan: A\+/)).toBeInTheDocument()
  })

  it('seviye filtresi', async () => {
    const { user } = renderDash()
    const select = screen.getByLabelText('Seviye filtresi')
    await user.selectOptions(select, 'RED')
    expect(ids()).toEqual(['RED-1'])
    await user.selectOptions(select, 'GREEN')
    expect(ids()).toEqual(['GREEN-1'])
    await user.selectOptions(select, 'ALL')
    expect(ids()).toHaveLength(4)
  })

  it('kurtarıldı işaretlemesi listeyi, özeti ve depoyu günceller', async () => {
    const { user, storage } = renderDash()
    const red = screen.getAllByTestId('call-card')[0]
    await user.click(within(red).getByRole('button', { name: 'Kurtarıldı olarak işaretle' }))
    expect(ids()).toEqual(['YELLOW-1', 'GREEN-1', 'RED-1', 'DONE-1'])
    expect(screen.getByTestId('summary-RED')).toHaveTextContent('0')
    expect(screen.getByTestId('summary-RESCUED')).toHaveTextContent('2')
    expect(screen.getAllByTestId('call-card')[0]).toHaveAttribute('data-level', 'YELLOW')
    expect(parseCalls(storage.getItem(KEYS.received)).find((c) => c.id === 'RED-1')?.status).toBe('RESCUED')
  })

  it('boş panel ve devre dışı dışa aktarım', () => {
    renderDash([])
    expect(screen.getByText('Henüz çağrı yok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON indir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CSV indir' })).toBeDisabled()
  })

  it('JSON ve CSV dışa aktarımı indirme başlatır', async () => {
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((b: Blob) => {
        blobs.push(b)
        return 'blob:x'
      }),
      revokeObjectURL: vi.fn(),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = renderDash()
    await user.click(screen.getByRole('button', { name: 'JSON indir' }))
    await user.click(screen.getByRole('button', { name: 'CSV indir' }))
    expect(click).toHaveBeenCalledTimes(2)
    expect(blobs[0].type).toBe('application/json;charset=utf-8')
    expect(blobs[1].type).toBe('text/csv;charset=utf-8')
    // jsdom Blob'unda .text() yok, FileReader kullanılır.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(blobs[0])
    })
    const json = JSON.parse(text)
    expect(json.calls.map((c: { id: string }) => c.id)).toEqual(['RED-1', 'YELLOW-1', 'GREEN-1', 'DONE-1'])
  })
})
