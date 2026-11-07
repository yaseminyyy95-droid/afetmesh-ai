import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import type { TriageLevel } from '../types'
import { sortByPriority, summarize } from '../lib/triage'
import { LevelBadge } from './LevelBadge'
import { ExportPanel } from './ExportPanel'

type Filter = 'ALL' | TriageLevel
const FILTERS: Filter[] = ['ALL', 'RED', 'YELLOW', 'GREEN']

export function RescueDashboard({ now }: { now?: Date }) {
  const { state, dispatch, t } = useApp()
  const [filter, setFilter] = useState<Filter>('ALL')
  const triaged = useMemo(() => sortByPriority(state.received, now ?? new Date()), [state.received, now])
  const summary = summarize(triaged)
  const visible = filter === 'ALL' ? triaged : triaged.filter((c) => c.status === 'OPEN' && c.triage.level === filter)

  return (
    <section aria-labelledby="dash-title" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 id="dash-title" className="text-xl font-bold text-slate-900">
        {t('dash.title')}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t('dash.intro')}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="summary">
        {(['RED', 'YELLOW', 'GREEN'] as const).map((l) => (
          <div key={l} className="rounded-lg border border-slate-200 p-3">
            <dt>
              <LevelBadge level={l} />
            </dt>
            <dd data-testid={`summary-${l}`} className="mt-1 text-2xl font-bold text-slate-900">
              {summary[l]}
            </dd>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 p-3">
          <dt className="text-xs font-bold text-slate-500">{t('dash.rescuedCount')}</dt>
          <dd data-testid="summary-RESCUED" className="mt-1 text-2xl font-bold text-slate-900">
            {summary.RESCUED}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          {t('dash.filter')}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-lg border border-slate-300 px-2 py-1"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === 'ALL' ? t('dash.all') : t(`level.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <ExportPanel calls={triaged} />
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">{t('dash.empty')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((c) => (
            <li
              key={c.id}
              data-testid="call-card"
              data-level={c.triage.level}
              data-status={c.status}
              className={`rounded-xl border-l-8 bg-slate-50 p-4 ${
                c.status === 'RESCUED'
                  ? 'border-slate-300 opacity-60'
                  : c.triage.level === 'RED'
                    ? 'border-red-600'
                    : c.triage.level === 'YELLOW'
                      ? 'border-amber-400'
                      : 'border-emerald-600'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {c.status === 'RESCUED' ? (
                    <span className="rounded-md bg-slate-400 px-2 py-0.5 text-xs font-bold text-white">{t('dash.rescued')}</span>
                  ) : (
                    <LevelBadge level={c.triage.level} />
                  )}
                  <span className="text-sm font-semibold text-slate-900">{t('dash.score', { score: c.triage.score })}</span>
                  <span className="font-mono text-xs text-slate-500">{c.id}</span>
                </div>
                {c.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'MARK_RESCUED', id: c.id })}
                    className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    {t('dash.markRescued')}
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-800">
                {t(`debris.${c.debrisStatus}`)} · {t('dash.people', { count: c.peopleCount })} ·{' '}
                {t('dash.injured', { count: c.injuredCount })} · {t('dash.blood', { value: c.bloodType === 'UNKNOWN' ? '?' : c.bloodType })} ·{' '}
                {t('dash.hops', { count: Math.max(0, (c.hops?.length ?? 1) - 1) })}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-600">
                {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                {c.locationNote && <span className="font-sans"> · {c.locationNote}</span>}
              </p>
              {c.narrative && <p className="mt-1 text-sm italic text-slate-700">“{c.narrative}”</p>}
              {c.triage.reasons.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1" aria-label="reasons">
                  {c.triage.reasons.map((r) => (
                    <li key={r} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {t(`reason.${r}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
