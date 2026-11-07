import { useApp } from '../state/AppContext'
import type { MeshEvent, MeshNode } from '../lib/mesh'

function nodeColor(n: MeshNode): string {
  if (!n.online) return '#94a3b8'
  return n.kind === 'rescue' ? '#1d4ed8' : '#059669'
}

export function MeshSimulator() {
  const { mesh, t, state } = useApp()
  // meshTick (context) her mesh olayında yeniden çizimi tetikler.
  const nodes = mesh.getNodes()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const label = (id?: string) => (id ? byId.get(id)?.label ?? id : '')

  const describe = (e: MeshEvent) => {
    const key = e.type === 'status' ? (e.online ? 'mesh.ev.status_on' : 'mesh.ev.status_off') : `mesh.ev.${e.type}`
    return t(key, { node: label(e.nodeId), peer: label(e.peerId), id: (e.messageId ?? '').slice(-6) })
  }

  return (
    <section aria-labelledby="mesh-title" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 id="mesh-title" className="text-xl font-bold text-slate-900">
        {t('mesh.title')}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t('mesh.intro')}</p>

      <svg viewBox="0 0 430 230" role="img" aria-label={t('mesh.title')} className="mt-4 w-full max-w-xl">
        {mesh.getLinks().map(([a, b]) => {
          const na = byId.get(a)!
          const nb = byId.get(b)!
          const live = na.online && nb.online
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke={live ? '#64748b' : '#cbd5e1'}
              strokeWidth={2}
              strokeDasharray={live ? undefined : '5 4'}
            />
          )
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={n.kind === 'rescue' ? 22 : 17} fill={nodeColor(n)} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              {mesh.inbox(n.id).length}
            </text>
            <text x={n.x} y={n.y + (n.kind === 'rescue' ? 38 : 32)} textAnchor="middle" fontSize="10" fill="#334155">
              {n.label}
            </text>
          </g>
        ))}
      </svg>

      <p className="mt-2 text-sm font-medium text-slate-700" data-testid="pending-count">
        {t('mesh.pending', { count: mesh.pendingCount() })}
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((n) => (
          <li key={n.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div>
              <p className="font-semibold text-slate-900">{n.label}</p>
              <p className="text-slate-500">{t('mesh.inbox', { count: mesh.inbox(n.id).length })}</p>
            </div>
            <button
              type="button"
              aria-pressed={n.online}
              aria-label={t('mesh.toggle', { node: n.label })}
              onClick={() => mesh.setOnline(n.id, !n.online)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${n.online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
            >
              {n.online ? t('mesh.online') : t('mesh.offline')}
            </button>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">{t('mesh.log')}</h3>
      {state.meshEvents.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t('mesh.logEmpty')}</p>
      ) : (
        <ol data-testid="mesh-log" className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-slate-700">
          {state.meshEvents.slice(0, 40).map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="text-slate-400">{new Date(e.at).toLocaleTimeString()}</span> {describe(e)}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
