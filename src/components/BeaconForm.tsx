import { useState } from 'react'
import type { FormEvent } from 'react'
import { useApp } from '../state/AppContext'
import { BLOOD_TYPES, DEBRIS_STATUSES } from '../types'
import type { TriageResult } from '../types'
import { validateBeacon } from '../lib/validation'
import type { BeaconInput, ValidationErrors } from '../lib/validation'
import { triageCall } from '../lib/triage'
import type { DispatchResult } from '../lib/connectivity'
import { LevelBadge } from './LevelBadge'

const fieldCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-200'
const labelCls = 'block text-sm font-medium text-slate-700'

export function BeaconForm() {
  const { mesh, t, submitBeacon, state } = useApp()
  const citizens = mesh.getNodes().filter((n) => n.kind === 'citizen')
  const [form, setForm] = useState<BeaconInput>({
    deviceId: citizens[0]?.id ?? '',
    lat: '',
    lng: '',
    locationNote: '',
    debrisStatus: 'TRAPPED',
    bloodType: 'UNKNOWN',
    peopleCount: '1',
    injuredCount: '0',
    hasChildren: false,
    hasElderly: false,
    canCommunicate: true,
    narrative: '',
  })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<{ result: DispatchResult; triage: TriageResult } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(false)

  const set = <K extends keyof BeaconInput>(key: K, value: BeaconInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const locate = () => {
    setLocateError(false)
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo) {
      setLocateError(true)
      return
    }
    setLocating(true)
    geo.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }))
      },
      () => {
        setLocating(false)
        setLocateError(true)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const v = validateBeacon(form)
    if (!v.ok) {
      setErrors(v.errors)
      setOutcome(null)
      return
    }
    setErrors({})
    setSending(true)
    try {
      const { call, result } = await submitBeacon(v.value)
      setOutcome({ result, triage: triageCall(call) })
    } finally {
      setSending(false)
    }
  }

  const err = (field: keyof ValidationErrors) =>
    errors[field] ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-sm text-red-700">
        {t(errors[field] as string)}
      </p>
    ) : null

  return (
    <section aria-labelledby="beacon-title" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 id="beacon-title" className="text-xl font-bold text-slate-900">
        {t('beacon.title')}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t('beacon.intro')}</p>

      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="deviceId" className={labelCls}>
            {t('beacon.device')}
          </label>
          <select id="deviceId" className={fieldCls} value={form.deviceId} onChange={(e) => set('deviceId', e.target.value)}>
            {citizens.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          {err('deviceId')}
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={locate}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            {locating ? t('beacon.locating') : t('beacon.locate')}
          </button>
        </div>
        {locateError && (
          <p role="alert" className="text-sm text-amber-700 sm:col-span-2">
            {t('beacon.locateError')}
          </p>
        )}

        <div>
          <label htmlFor="lat" className={labelCls}>
            {t('beacon.lat')}
          </label>
          <input
            id="lat"
            inputMode="decimal"
            placeholder="37.5753"
            className={fieldCls}
            value={form.lat}
            aria-invalid={Boolean(errors.lat)}
            aria-describedby={errors.lat ? 'lat-error' : undefined}
            onChange={(e) => set('lat', e.target.value)}
          />
          {err('lat')}
        </div>
        <div>
          <label htmlFor="lng" className={labelCls}>
            {t('beacon.lng')}
          </label>
          <input
            id="lng"
            inputMode="decimal"
            placeholder="36.9228"
            className={fieldCls}
            value={form.lng}
            aria-invalid={Boolean(errors.lng)}
            aria-describedby={errors.lng ? 'lng-error' : undefined}
            onChange={(e) => set('lng', e.target.value)}
          />
          {err('lng')}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="locationNote" className={labelCls}>
            {t('beacon.locationNote')}
          </label>
          <input id="locationNote" className={fieldCls} value={form.locationNote} onChange={(e) => set('locationNote', e.target.value)} />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className={labelCls}>{t('beacon.debris')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {DEBRIS_STATUSES.map((d) => (
              <label
                key={d}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  form.debrisStatus === d ? 'border-red-600 bg-red-50 font-semibold' : 'border-slate-300'
                }`}
              >
                <input type="radio" name="debrisStatus" value={d} checked={form.debrisStatus === d} onChange={() => set('debrisStatus', d)} />
                {t(`debris.${d}`)}
              </label>
            ))}
          </div>
          {err('debrisStatus')}
        </fieldset>

        <div>
          <label htmlFor="bloodType" className={labelCls}>
            {t('beacon.blood')}
          </label>
          <select id="bloodType" className={fieldCls} value={form.bloodType} onChange={(e) => set('bloodType', e.target.value)}>
            {BLOOD_TYPES.map((b) => (
              <option key={b} value={b}>
                {b === 'UNKNOWN' ? t('blood.UNKNOWN') : b}
              </option>
            ))}
          </select>
          {err('bloodType')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="peopleCount" className={labelCls}>
              {t('beacon.people')}
            </label>
            <input id="peopleCount" inputMode="numeric" className={fieldCls} value={form.peopleCount} onChange={(e) => set('peopleCount', e.target.value)} />
            {err('peopleCount')}
          </div>
          <div>
            <label htmlFor="injuredCount" className={labelCls}>
              {t('beacon.injured')}
            </label>
            <input id="injuredCount" inputMode="numeric" className={fieldCls} value={form.injuredCount} onChange={(e) => set('injuredCount', e.target.value)} />
            {err('injuredCount')}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 sm:col-span-2">
          {(['hasChildren', 'hasElderly', 'canCommunicate'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
              {t(k === 'hasChildren' ? 'beacon.children' : k === 'hasElderly' ? 'beacon.elderly' : 'beacon.canCommunicate')}
            </label>
          ))}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="narrative" className={labelCls}>
            {t('beacon.narrative')}
          </label>
          <textarea
            id="narrative"
            rows={3}
            maxLength={500}
            placeholder={t('beacon.narrativeHint')}
            className={fieldCls}
            value={form.narrative}
            onChange={(e) => set('narrative', e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="rounded-2xl bg-red-700 px-6 py-5 text-lg font-extrabold tracking-wide text-white shadow-lg hover:bg-red-800 disabled:opacity-60 sm:col-span-2"
        >
          {sending ? t('beacon.sending') : t('beacon.submit')}
        </button>
      </form>

      <div role="status" aria-live="polite" className="mt-4 space-y-1 text-sm">
        {outcome && (
          <>
            {outcome.result.fallbackReason && outcome.result.fallbackReason !== 'offline' && (
              <p className="font-medium text-amber-700">{t(`beacon.fallback.${outcome.result.fallbackReason}`)}</p>
            )}
            <p className="font-semibold text-slate-900">
              {outcome.result.channel === 'internet' ? t('beacon.sentInternet') : t('beacon.sentMesh')}
            </p>
            <p className="flex items-center gap-2 text-slate-700">
              <LevelBadge level={outcome.triage.level} />
              {t('beacon.triagePreview', { level: t(`level.${outcome.triage.level}`), score: outcome.triage.score })}
            </p>
          </>
        )}
        <p className="text-slate-500">{t('beacon.saved', { count: state.outbox.length })}</p>
      </div>
    </section>
  )
}
