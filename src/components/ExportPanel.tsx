import { useApp } from '../state/AppContext'
import type { TriagedCall } from '../types'
import { downloadText, exportFilename, toAfadJson, toCsv } from '../lib/export'

export function ExportPanel({ calls }: { calls: TriagedCall[] }) {
  const { t } = useApp()
  const empty = calls.length === 0
  const btn = 'rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40'
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2" role="group" aria-label={t('export.title')}>
        <span className="text-xs font-bold uppercase text-slate-500">{t('export.title')}</span>
        <button
          type="button"
          className={btn}
          disabled={empty}
          onClick={() => downloadText(exportFilename('json'), toAfadJson(calls), 'application/json')}
        >
          {t('export.json')}
        </button>
        <button type="button" className={btn} disabled={empty} onClick={() => downloadText(exportFilename('csv'), toCsv(calls), 'text/csv')}>
          {t('export.csv')}
        </button>
      </div>
      <p className="max-w-sm text-right text-[11px] text-slate-500">{t('export.note')}</p>
    </div>
  )
}
