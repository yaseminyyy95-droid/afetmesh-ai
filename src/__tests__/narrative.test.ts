import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractFlags, MockEdgeLLM } from '../lib/narrative'

describe('extractFlags (mock edge LLM çıkarımı)', () => {
  it('boş metinde işaret yok', () => {
    expect(extractFlags('')).toEqual({ critical: 0, medical: false, pregnancy: false, matched: [] })
  })

  it('Türkçe büyük harfi (İ/I) doğru küçültür', () => {
    expect(extractFlags('ANNEM BİLİNÇSİZ').critical).toBe(1)
  })

  it('İngilizce büyük harfi doğru küçültür', () => {
    expect(extractFlags('Father is UNCONSCIOUS').critical).toBe(1)
  })

  it('iç içe terimleri bir kez sayar (ağır kanama ⊃ kanama)', () => {
    const r = extractFlags('bacakta ağır kanama var')
    expect(r.critical).toBe(1)
    expect(r.matched).toEqual(['ağır kanama'])
  })

  it('tıbbi bağımlılık ve hamileliği bulur', () => {
    const r = extractFlags('Eşim hamile, ben insülin kullanıyorum')
    expect(r.medical).toBe(true)
    expect(r.pregnancy).toBe(true)
    expect(r.matched).toEqual(['insülin', 'hamile'])
  })

  it('undefined metne dayanıklıdır', () => {
    expect(extractFlags(undefined as unknown as string).critical).toBe(0)
  })
})

describe('MockEdgeLLM', () => {
  afterEach(() => vi.useRealTimers())

  it('adı ve analiz sonucu', async () => {
    const model = new MockEdgeLLM()
    expect(model.name).toBe('mock-edge-llm-v1')
    await expect(model.analyze('crush injury')).resolves.toMatchObject({ critical: 1 })
  })

  it('cihaz gecikmesini simüle eder', async () => {
    vi.useFakeTimers()
    const model = new MockEdgeLLM(250)
    let done = false
    const p = model.analyze('diyaliz').then((r) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(249)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toMatchObject({ medical: true })
  })
})
