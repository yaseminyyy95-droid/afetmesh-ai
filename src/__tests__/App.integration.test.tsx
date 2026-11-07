import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createDemoNetwork, RESCUE_NODE_ID } from '../lib/mesh'
import { createMemoryStore, KEYS, parseCalls, serializeCalls } from '../lib/storage'
import { makeCall } from '../test/factories'
import { renderHook } from '@testing-library/react'
import { useApp } from '../state/AppContext'

function setup(props: Partial<Parameters<typeof App>[0]> = {}) {
  const mesh = props.mesh ?? createDemoNetwork()
  const storage = props.storage ?? createMemoryStore()
  const user = userEvent.setup()
  const originate = vi.spyOn(mesh, 'originate')
  render(<App mesh={mesh} storage={storage} bridgeCtor={null} {...props} />)
  return { mesh, storage, user, originate }
}

async function fillAndSend(user: ReturnType<typeof userEvent.setup>, narrative = 'babam nefes alamıyor') {
  await user.type(screen.getByLabelText('Enlem'), '37.5753')
  await user.type(screen.getByLabelText('Boylam'), '36.9228')
  await user.type(screen.getByLabelText('Adres / bina tarifi'), 'Ebrar Sitesi')
  await user.selectOptions(screen.getByLabelText('Kan grubu'), '0-')
  await user.clear(screen.getByLabelText('Kişi sayısı'))
  await user.type(screen.getByLabelText('Kişi sayısı'), '3')
  await user.click(screen.getByLabelText('Yanımda çocuk var'))
  await user.type(screen.getByLabelText('Durumu kısaca yazın'), narrative)
  await user.click(screen.getByRole('button', { name: 'ACİL YARDIM ÇAĞRISI GÖNDER' }))
}

describe('Entegrasyon: acil durum butonu → state → mesh → kurtarma paneli', () => {
  it('afet modunda çağrı mesh katmanına iletilir, offline kaydedilir ve panelde KIRMIZI görünür', async () => {
    const { user, originate, storage, mesh } = setup()

    await fillAndSend(user)

    const status = await screen.findByRole('status')
    await within(status).findByText(/mesh ağına bırakıldı/)
    expect(within(status).getByText(/Ön değerlendirme: KIRMIZI/)).toBeInTheDocument()
    expect(within(status).getByText('Bu cihazda kayıtlı çağrı: 1')).toBeInTheDocument()

    // Mock mesh katmanına iletim
    expect(originate).toHaveBeenCalledTimes(1)
    expect(originate).toHaveBeenCalledWith(
      'N1',
      expect.objectContaining({ lat: 37.5753, lng: 36.9228, bloodType: '0-', peopleCount: 3, debrisStatus: 'TRAPPED', hasChildren: true }),
    )
    expect(mesh.inbox(RESCUE_NODE_ID)).toHaveLength(1)

    // Offline storage
    const outbox = parseCalls(storage.getItem(KEYS.outbox))
    expect(outbox).toHaveLength(1)
    await waitFor(() => expect(parseCalls(storage.getItem(KEYS.received))).toHaveLength(1))

    // Kurtarma paneli
    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    const cards = screen.getAllByTestId('call-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-level', 'RED')
    expect(within(cards[0]).getByText(/3 atlama/)).toBeInTheDocument()
    expect(within(cards[0]).getByText('Kritik belirti')).toBeInTheDocument()
  })

  it('geçersiz form mesh katmanına hiçbir şey göndermez', async () => {
    const { user, originate } = setup()
    await user.clear(screen.getByLabelText('Kişi sayısı'))
    await user.click(screen.getByRole('button', { name: 'ACİL YARDIM ÇAĞRISI GÖNDER' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toEqual(
      expect.arrayContaining(['Enlem -90 ile 90 arasında bir sayı olmalı.', 'Kişi sayısı 1 ile 50 arasında tam sayı olmalı.']),
    )
    expect(screen.getByLabelText('Enlem')).toHaveAttribute('aria-invalid', 'true')
    expect(originate).not.toHaveBeenCalled()
  })

  it('farklı cihaz ve enkaz durumu seçilebilir', async () => {
    const { user, originate } = setup()
    await user.selectOptions(screen.getByLabelText('Gönderen cihaz'), 'N4')
    await user.click(screen.getByLabelText('Enkaz dışındayım'))
    await user.click(screen.getByLabelText('Yanımda yaşlı var'))
    await user.click(screen.getByLabelText('Sesle iletişim kurabiliyorum'))
    await user.type(screen.getByLabelText('Yaralı sayısı'), '{backspace}1')
    await fillAndSend(user, 'bacağım ağrıyor')
    await screen.findByText(/mesh ağına bırakıldı/)
    expect(originate).toHaveBeenCalledWith(
      'N4',
      expect.objectContaining({ debrisStatus: 'FREE', hasElderly: true, canCommunicate: false, injuredCount: 1 }),
    )
  })
})

describe('Ağ kesintisi senaryoları (UI)', () => {
  it('internet varken demo sunucusu üzerinden doğrudan panele ulaşır, mesh kullanılmaz', async () => {
    const { user, originate } = setup({ initialDisasterMode: false })
    expect(screen.getByTestId('conn-badge')).toHaveTextContent('İnternet/GSM var')
    await fillAndSend(user)
    await screen.findByText('Çağrı internet üzerinden iletildi.')
    expect(originate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(within(screen.getByTestId('call-card')).getByText(/1 atlama/)).toBeInTheDocument()
  })

  it('internet var görünürken sunucu hata verirse mesh yedeğine düşer', async () => {
    const postToServer = vi.fn().mockRejectedValue(new Error('502 Bad Gateway'))
    const { user, originate } = setup({ initialDisasterMode: false, postToServer })
    await fillAndSend(user)
    await screen.findByText('Sunucuya ulaşılamadı, mesh ağına geçildi.')
    expect(postToServer).toHaveBeenCalledTimes(1)
    expect(originate).toHaveBeenCalledTimes(1)
  })

  it('sunucu zaman aşımına uğrarsa mesh yedeğine düşer', async () => {
    const postToServer = vi.fn(() => new Promise<void>(() => undefined))
    const { user, originate } = setup({ initialDisasterMode: false, postToServer, serverTimeoutMs: 30 })
    await fillAndSend(user)
    await screen.findByText('Sunucu yanıt vermedi, mesh ağına geçildi.')
    expect(originate).toHaveBeenCalledTimes(1)
  })

  it('tarayıcı offline olayı bağlantı rozetini değiştirir', async () => {
    setup({ initialDisasterMode: false })
    expect(screen.getByTestId('conn-badge')).toHaveTextContent('İnternet/GSM var')
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('conn-badge')).toHaveTextContent('Bağlantı yok: mesh modu')
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByTestId('conn-badge')).toHaveTextContent('İnternet/GSM var')
  })

  it('afet modu düğmesi bağlantıyı kesik sayar', async () => {
    const { user } = setup({ initialDisasterMode: false })
    await user.click(screen.getByRole('button', { name: 'Afet modu: KAPALI' }))
    expect(screen.getByRole('button', { name: 'Afet modu: AÇIK' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('conn-badge')).toHaveTextContent('Bağlantı yok: mesh modu')
  })
})

describe('Mesh simülatörü UI: kesinti ve toparlanma', () => {
  it('aktarıcılar kapalıyken çağrı bekler, açılınca kurtarma paneline düşer', async () => {
    const { user, mesh } = setup()
    await user.click(screen.getByRole('tab', { name: 'Mesh Ağı' }))
    expect(screen.getByText('Henüz olay yok.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tel-3 (sokak) aç/kapat' }))
    await user.click(screen.getByRole('button', { name: 'Tel-5 (toplanma alanı) aç/kapat' }))
    expect(screen.getByRole('button', { name: 'Tel-3 (sokak) aç/kapat' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(screen.getByTestId('mesh-log')).getByText(/Tel-3 \(sokak\) ağdan çıktı/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Acil Çağrı' }))
    await fillAndSend(user)
    await screen.findByText(/mesh ağına bırakıldı/)
    expect(mesh.inbox(RESCUE_NODE_ID)).toHaveLength(0)

    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(screen.getByText('Henüz çağrı yok.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Mesh Ağı' }))
    expect(screen.getByTestId('pending-count')).toHaveTextContent('Bekleyen aktarım: 2')
    const log = screen.getByTestId('mesh-log')
    expect(within(log).getAllByText(/bekletiliyor/).length).toBeGreaterThan(0)
    expect(within(log).getByText(/yeni çağrı üretti/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tel-3 (sokak) aç/kapat' }))
    expect(within(screen.getByTestId('mesh-log')).getByText(/Kurtarma Ekibi çağrıyı aldı/)).toBeInTheDocument()
    expect(within(screen.getByTestId('mesh-log')).getByText(/Tel-3 \(sokak\) ağa katıldı/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(screen.getAllByTestId('call-card')).toHaveLength(1)
  })

  it('TTL ve tekrar olayları günlükte okunur metinle gösterilir', async () => {
    const mesh = createDemoNetwork()
    const { user } = setup({ mesh })
    act(() => {
      mesh.originate('N1', makeCall({ id: 'CALL-TTL001' }), 1)
    })
    await user.click(screen.getByRole('tab', { name: 'Mesh Ağı' }))
    const log = screen.getByTestId('mesh-log')
    expect(within(log).getByText(/atlama sınırı doldu \(TTL001\)/)).toBeInTheDocument()
    act(() => {
      mesh.originate('N2', makeCall({ id: 'CALL-DUP002' }))
    })
    expect(within(screen.getByTestId('mesh-log')).getAllByText(/tekrar aldı, yok sayıldı/).length).toBeGreaterThan(0)
  })
})

describe('Dil, konum ve bağlam', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('İngilizceye geçer ve tercihi saklar', async () => {
    const { user, storage } = setup()
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { name: 'Citizen Emergency Beacon' })).toBeInTheDocument()
    expect(storage.getItem(KEYS.lang)).toBe('en')
    await user.click(screen.getByRole('button', { name: 'Türkçe' }))
    expect(storage.getItem(KEYS.lang)).toBe('tr')
  })

  it('kayıtlı dil tercihiyle açılır', () => {
    setup({ storage: createMemoryStore({ [KEYS.lang]: 'en' }) })
    expect(screen.getByRole('tab', { name: 'Rescue Dashboard' })).toBeInTheDocument()
  })

  it('geolocation başarılıysa koordinatları doldurur', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 36.2021, longitude: 36.1604 } } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', { ...navigator, onLine: true, geolocation: { getCurrentPosition } })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Konumumu al' }))
    expect(screen.getByLabelText('Enlem')).toHaveValue('36.202100')
    expect(screen.getByLabelText('Boylam')).toHaveValue('36.160400')
  })

  it('geolocation hata verirse uyarı gösterir, sürerken bekleme metni görünür', async () => {
    let fail: PositionErrorCallback = () => undefined
    const getCurrentPosition = vi.fn((_ok: PositionCallback, err: PositionErrorCallback) => {
      fail = err
    })
    vi.stubGlobal('navigator', { ...navigator, onLine: true, geolocation: { getCurrentPosition } })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Konumumu al' }))
    expect(screen.getByRole('button', { name: 'Konum alınıyor…' })).toBeInTheDocument()
    act(() => fail({ code: 1 } as GeolocationPositionError))
    expect(screen.getByText('Konum alınamadı. Koordinatları elle girin.')).toBeInTheDocument()
  })

  it('geolocation desteklenmiyorsa uyarı gösterir', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Konumumu al' }))
    expect(screen.getByText('Konum alınamadı. Koordinatları elle girin.')).toBeInTheDocument()
  })

  it('useApp sağlayıcı dışında açık hata verir', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/)
  })

  it('başka sekmeden gelen çağrı panele eklenir (BroadcastChannel)', async () => {
    class Chan {
      static inst: Chan
      onmessage: ((e: { data: unknown }) => void) | null = null
      constructor() {
        Chan.inst = this
      }
      postMessage() {}
      close() {}
    }
    const user = userEvent.setup()
    render(<App mesh={createDemoNetwork()} storage={createMemoryStore()} bridgeCtor={Chan} />)
    act(() => Chan.inst.onmessage!({ data: { type: 'call', call: makeCall({ id: 'FROM-TAB' }) } }))
    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(screen.getByText('FROM-TAB')).toBeInTheDocument()
  })

  it('varsayılan bağımlılıklarla (gerçek localStorage, demo mesh) çalışır', async () => {
    window.localStorage.setItem(KEYS.received, serializeCalls([makeCall({ id: 'LS-1' })]))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /Kurtarma Paneli/ }))
    expect(screen.getByText('LS-1')).toBeInTheDocument()
  })
})
