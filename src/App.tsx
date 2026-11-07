import { useState } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import type { AppProviderProps } from './state/AppContext'
import { BeaconForm } from './components/BeaconForm'
import { MeshSimulator } from './components/MeshSimulator'
import { RescueDashboard } from './components/RescueDashboard'

type Tab = 'beacon' | 'mesh' | 'dashboard'
const TABS: Tab[] = ['beacon', 'mesh', 'dashboard']

export function Shell() {
  const { state, dispatch, t, online } = useApp()
  const [tab, setTab] = useState<Tab>('beacon')
  const openCount = state.received.filter((c) => c.status === 'OPEN').length

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-red-700">{t('app.title')}</h1>
          <p className="text-sm text-slate-600">{t('app.tagline')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="conn-badge"
            className={`rounded-full px-3 py-1 text-xs font-bold ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
          >
            {online ? t('conn.online') : t('conn.offline')}
          </span>
          <button
            type="button"
            title={t('disaster.hint')}
            aria-pressed={state.disasterMode}
            onClick={() => dispatch({ type: 'TOGGLE_DISASTER' })}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
          >
            {state.disasterMode ? t('disaster.on') : t('disaster.off')}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_LANG', lang: state.lang === 'tr' ? 'en' : 'tr' })}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800"
          >
            {t('lang.toggle')}
          </button>
        </div>
      </header>

      <nav role="tablist" className="mt-5 flex gap-2 overflow-x-auto">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t(`tab.${id}`)}
            {id === 'dashboard' && openCount > 0 && (
              <span className="ml-2 rounded-full bg-red-600 px-2 text-xs text-white">{openCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="mt-4" role="tabpanel">
        {tab === 'beacon' && <BeaconForm />}
        {tab === 'mesh' && <MeshSimulator />}
        {tab === 'dashboard' && <RescueDashboard />}
      </main>
    </div>
  )
}

export default function App(props: Omit<AppProviderProps, 'children'>) {
  return (
    <AppProvider {...props}>
      <Shell />
    </AppProvider>
  )
}
