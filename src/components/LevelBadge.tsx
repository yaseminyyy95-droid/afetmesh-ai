import type { TriageLevel } from '../types'
import { useApp } from '../state/AppContext'

export const LEVEL_STYLES: Record<TriageLevel, string> = {
  RED: 'bg-red-600 text-white',
  YELLOW: 'bg-amber-400 text-slate-900',
  GREEN: 'bg-emerald-600 text-white',
}

export function LevelBadge({ level }: { level: TriageLevel }) {
  const { t } = useApp()
  return (
    <span data-testid="level-badge" className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${LEVEL_STYLES[level]}`}>
      {t(`level.${level}`)}
    </span>
  )
}
