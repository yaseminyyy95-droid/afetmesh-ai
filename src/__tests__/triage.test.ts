import { describe, expect, it } from 'vitest'
import { hoursSince, levelFromScore, sortByPriority, summarize, THRESHOLDS, triageCall } from '../lib/triage'
import { makeCall, NOW } from '../test/factories'

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

describe('levelFromScore', () => {
  it.each([
    [0, 'GREEN'],
    [THRESHOLDS.YELLOW - 1, 'GREEN'],
    [THRESHOLDS.YELLOW, 'YELLOW'],
    [THRESHOLDS.RED - 1, 'YELLOW'],
    [THRESHOLDS.RED, 'RED'],
    [100, 'RED'],
  ])('score %i → %s', (score, level) => {
    expect(levelFromScore(score)).toBe(level)
  })
})

describe('hoursSince', () => {
  it('geçen saati hesaplar', () => expect(hoursSince(hoursAgo(5), NOW)).toBeCloseTo(5))
  it('gelecekteki tarih için 0 döner', () => expect(hoursSince(hoursAgo(-3), NOW)).toBe(0))
  it('geçersiz tarih için 0 döner', () => expect(hoursSince('not-a-date', NOW)).toBe(0))
})

describe('triageCall', () => {
  it('risk işareti olmayan çağrı YEŞİL ve 0 puandır', () => {
    expect(triageCall(makeCall(), NOW)).toEqual({ score: 0, level: 'GREEN', reasons: [] })
  })

  it('yalnızca enkaz altında olmak 40 puan ve SARI verir', () => {
    const r = triageCall(makeCall({ debrisStatus: 'TRAPPED' }), NOW)
    expect(r).toEqual({ score: 40, level: 'YELLOW', reasons: ['TRAPPED'] })
  })

  it('kısmen sıkışma 25 puandır', () => {
    expect(triageCall(makeCall({ debrisStatus: 'PARTIAL' }), NOW).score).toBe(25)
  })

  it('enkaz + kritik belirti KIRMIZI olur', () => {
    const r = triageCall(makeCall({ debrisStatus: 'TRAPPED', narrative: 'Babam nefes alamıyor' }), NOW)
    expect(r.score).toBe(60)
    expect(r.level).toBe('RED')
    expect(r.reasons).toEqual(['TRAPPED', 'CRITICAL_SYMPTOM'])
  })

  it('yaralı puanı 5 kişide tavan yapar', () => {
    expect(triageCall(makeCall({ peopleCount: 2, injuredCount: 2 }), NOW).score).toBe(16)
    expect(triageCall(makeCall({ peopleCount: 2, injuredCount: 9 }), NOW).score).toBe(25)
  })

  it('kritik belirti puanı iki terimde tavan yapar', () => {
    const r = triageCall(makeCall({ narrative: 'bilinçsiz, ağır kanama, ezilme var' }), NOW)
    expect(r.score).toBe(40)
  })

  it('tıbbi bağımlılık, hamilelik, çocuk/yaşlı ve iletişimsizlik puan ekler', () => {
    const r = triageCall(
      makeCall({ narrative: 'hamile, diyaliz hastası', hasChildren: true, hasElderly: true, canCommunicate: false }),
      NOW,
    )
    expect(r.score).toBe(10 + 8 + 16 + 10)
    expect(r.reasons).toEqual(['MEDICAL_DEPENDENCY', 'PREGNANCY', 'VULNERABLE', 'NO_RESPONSE'])
  })

  it('yalnızca çocuk varsa 8 puan ekler', () => {
    expect(triageCall(makeCall({ hasChildren: true }), NOW).score).toBe(8)
  })

  it('kalabalık puanı 3 kişiden başlar, 10 kişide tavan yapar', () => {
    expect(triageCall(makeCall({ peopleCount: 2 }), NOW).score).toBe(0)
    expect(triageCall(makeCall({ peopleCount: 3 }), NOW).score).toBe(6)
    expect(triageCall(makeCall({ peopleCount: 40 }), NOW).score).toBe(20)
  })

  it('bekleme süresi 72 saatte en fazla 15 puan ekler', () => {
    expect(triageCall(makeCall({ createdAt: hoursAgo(0.5) }), NOW).reasons).not.toContain('TIME_ELAPSED')
    expect(triageCall(makeCall({ createdAt: hoursAgo(36) }), NOW).score).toBe(8)
    expect(triageCall(makeCall({ createdAt: hoursAgo(72) }), NOW).score).toBe(15)
    expect(triageCall(makeCall({ createdAt: hoursAgo(200) }), NOW).score).toBe(15)
  })

  it('skor 100 ile sınırlanır', () => {
    const r = triageCall(
      makeCall({
        debrisStatus: 'TRAPPED',
        peopleCount: 10,
        injuredCount: 10,
        narrative: 'unconscious, severe bleeding, pregnant, oxygen',
        hasChildren: true,
        hasElderly: true,
        canCommunicate: false,
        createdAt: hoursAgo(80),
      }),
      NOW,
    )
    expect(r.score).toBe(100)
    expect(r.level).toBe('RED')
  })

  it('now verilmezse güncel zamanı kullanır', () => {
    expect(triageCall(makeCall({ createdAt: new Date().toISOString() })).score).toBe(0)
  })
})

describe('sortByPriority & summarize', () => {
  const red = makeCall({ id: 'R', debrisStatus: 'TRAPPED', narrative: 'bilinçsiz' })
  const redOlder = makeCall({ id: 'R-OLD', debrisStatus: 'TRAPPED', narrative: 'bilinçsiz', createdAt: '2026-02-06T05:10:00.000Z' })
  const yellowHigh = makeCall({ id: 'Y-HIGH', debrisStatus: 'TRAPPED', hasChildren: true })
  const yellow = makeCall({ id: 'Y', debrisStatus: 'TRAPPED' })
  const green = makeCall({ id: 'G' })
  const rescued = makeCall({ id: 'X', debrisStatus: 'TRAPPED', narrative: 'bilinçsiz, kanama', status: 'RESCUED' })

  it('açık KIRMIZI önce, kurtarılmış en sonda, eşit skorda eski önce', () => {
    const ids = sortByPriority([green, rescued, yellow, red, yellowHigh, redOlder], NOW).map((c) => c.id)
    expect(ids).toEqual(['R-OLD', 'R', 'Y-HIGH', 'Y', 'G', 'X'])
  })

  it('özet sayıları doğru', () => {
    expect(summarize(sortByPriority([green, rescued, yellow, red], NOW))).toEqual({
      RED: 1,
      YELLOW: 1,
      GREEN: 1,
      RESCUED: 1,
      total: 4,
    })
  })

  it('now verilmezse de sıralar', () => {
    expect(sortByPriority([green, red])[0].id).toBe('R')
  })
})
