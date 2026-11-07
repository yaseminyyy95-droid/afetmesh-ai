import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { EmergencyCall } from '../types'
import { appReducer } from './appReducer'
import type { AppAction, AppState } from './appReducer'
import { createDemoNetwork, MeshNetwork } from '../lib/mesh'
import { KEYS, loadCalls, safeLocalStorage, saveCalls } from '../lib/storage'
import type { KVStore } from '../lib/storage'
import { dispatchEmergency } from '../lib/connectivity'
import type { DispatchResult } from '../lib/connectivity'
import { createTabBridge, defaultChannelCtor } from '../lib/tabBridge'
import type { ChannelCtor, TabBridge } from '../lib/tabBridge'
import { createCall } from '../lib/call'
import type { BeaconValue } from '../lib/validation'
import { isLang, t as translate } from '../lib/i18n'

export interface AppProviderProps {
  children?: ReactNode
  mesh?: MeshNetwork
  storage?: KVStore
  /** Merkezi sunucuya gönderim. Verilmezse demo sunucusu çağrıyı doğrudan panele iletir. */
  postToServer?: (call: EmergencyCall) => Promise<void>
  initialDisasterMode?: boolean
  serverTimeoutMs?: number
  bridgeCtor?: ChannelCtor | null
}

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  mesh: MeshNetwork
  online: boolean
  meshTick: number
  t: (key: string, vars?: Record<string, string | number>) => string
  submitBeacon: (value: BeaconValue) => Promise<{ call: EmergencyCall; result: DispatchResult }>
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

const DEMO_SERVER_LATENCY_MS = 120

export function AppProvider({
  children,
  mesh: meshProp,
  storage: storageProp,
  postToServer,
  initialDisasterMode = true,
  serverTimeoutMs = 5000,
  bridgeCtor,
}: AppProviderProps) {
  const [mesh] = useState(() => meshProp ?? createDemoNetwork())
  const [storage] = useState(() => storageProp ?? safeLocalStorage())
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const storedLang = storage?.getItem(KEYS.lang)
    return {
      lang: isLang(storedLang) ? storedLang : 'tr',
      disasterMode: initialDisasterMode,
      received: loadCalls(KEYS.received, storage),
      outbox: loadCalls(KEYS.outbox, storage),
      meshEvents: [],
    } satisfies AppState
  })
  const [meshTick, setMeshTick] = useState(0)
  const browserOnline = useBrowserOnline()
  const online = browserOnline && !state.disasterMode
  const onlineRef = useRef(online)
  onlineRef.current = online

  // Köprü efekt içinde kurulur: StrictMode'daki kur-sök-kur döngüsünde kapanan kanal yeniden açılır.
  const bridgeRef = useRef<TabBridge | null>(null)
  useEffect(() => {
    const bridge = createTabBridge(
      (call) => dispatch({ type: 'RECEIVE_CALL', call }),
      bridgeCtor === undefined ? defaultChannelCtor() : bridgeCtor,
    )
    bridgeRef.current = bridge
    return () => {
      bridge.close()
      if (bridgeRef.current === bridge) bridgeRef.current = null
    }
  }, [bridgeCtor])
  const publish = useCallback((call: EmergencyCall) => bridgeRef.current?.publish(call) ?? false, [])

  useEffect(() => {
    const rescueIds = new Set(mesh.rescueNodeIds())
    return mesh.subscribe((event) => {
      dispatch({ type: 'MESH_EVENT', event })
      setMeshTick((n) => n + 1)
      if (event.type === 'delivered' && event.message && rescueIds.has(event.nodeId)) {
        const call = { ...event.message.payload, hops: event.message.hops }
        dispatch({ type: 'RECEIVE_CALL', call })
        publish(call)
      }
    })
  }, [mesh, publish])

  useEffect(() => {
    saveCalls(KEYS.received, state.received, storage)
  }, [state.received, storage])
  useEffect(() => {
    saveCalls(KEYS.outbox, state.outbox, storage)
  }, [state.outbox, storage])
  useEffect(() => {
    storage?.setItem(KEYS.lang, state.lang)
  }, [state.lang, storage])

  const demoServer = useCallback(
    async (call: EmergencyCall) => {
      await new Promise((r) => setTimeout(r, DEMO_SERVER_LATENCY_MS))
      const delivered = { ...call, hops: [call.deviceId, 'INTERNET'] }
      dispatch({ type: 'RECEIVE_CALL', call: delivered })
      publish(delivered)
    },
    [publish],
  )

  const submitBeacon = useCallback(
    async (value: BeaconValue) => {
      const call = createCall(value)
      dispatch({ type: 'ADD_OUTBOX', call })
      const result = await dispatchEmergency(call, value.deviceId, {
        isOnline: () => onlineRef.current,
        postToServer: postToServer ?? demoServer,
        mesh,
        timeoutMs: serverTimeoutMs,
      })
      return { call, result }
    },
    [mesh, postToServer, demoServer, serverTimeoutMs],
  )

  const tFn = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(state.lang, key, vars),
    [state.lang],
  )

  const value: AppContextValue = { state, dispatch, mesh, online, meshTick, t: tFn, submitBeacon }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
