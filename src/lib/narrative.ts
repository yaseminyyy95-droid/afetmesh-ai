/**
 * Mock Edge LLM: serbest metinden (Türkçe/İngilizce) tıbbi risk işaretleri çıkarır.
 * Gerçek bir dil modeli değildir. Cihazda çalışacak küçük bir modelin yerini tutan,
 * deterministik ve test edilebilir, sözlük tabanlı bir çıkarımcıdır.
 */
export interface NarrativeAnalysis {
  critical: number
  medical: boolean
  pregnancy: boolean
  matched: string[]
}

export const LEXICON = {
  critical: [
    'nefes alamıyor',
    'nefes alamiyor',
    'nefes almakta zorlanıyor',
    'bilinçsiz',
    'bilinci kapalı',
    'bilinci yok',
    'ağır kanama',
    'kanama',
    'ezilme',
    'ezildi',
    'not breathing',
    'unconscious',
    'severe bleeding',
    'bleeding',
    'crush',
  ],
  medical: ['diyaliz', 'insülin', 'insulin', 'oksijen', 'astım', 'astim', 'kalp', 'dialysis', 'oxygen', 'asthma', 'heart'],
  pregnancy: ['hamile', 'gebe', 'pregnant'],
} as const

function findTerms(haystacks: string[], terms: readonly string[]): string[] {
  const hits = terms.filter((term) => haystacks.some((h) => h.includes(term)))
  // "ağır kanama" eşleştiyse "kanama" ayrıca sayılmaz.
  return hits.filter((term) => !hits.some((other) => other !== term && other.includes(term)))
}

export function extractFlags(text: string): NarrativeAnalysis {
  const raw = (text ?? '').normalize('NFC')
  const haystacks = [raw.toLocaleLowerCase('tr-TR'), raw.toLowerCase()]
  const critical = findTerms(haystacks, LEXICON.critical)
  const medical = findTerms(haystacks, LEXICON.medical)
  const pregnancy = findTerms(haystacks, LEXICON.pregnancy)
  return {
    critical: critical.length,
    medical: medical.length > 0,
    pregnancy: pregnancy.length > 0,
    matched: [...critical, ...medical, ...pregnancy],
  }
}

export interface EdgeTriageModel {
  readonly name: string
  analyze(text: string): Promise<NarrativeAnalysis>
}

/** Cihaz üstü model arayüzünün sahte (mock) uygulaması. Gecikme simüle edilebilir. */
export class MockEdgeLLM implements EdgeTriageModel {
  readonly name = 'mock-edge-llm-v1'
  constructor(private readonly latencyMs = 0) {}

  analyze(text: string): Promise<NarrativeAnalysis> {
    return new Promise((resolve) => setTimeout(() => resolve(extractFlags(text)), this.latencyMs))
  }
}
