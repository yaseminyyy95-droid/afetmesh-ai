import type { EmergencyCall, Lang } from '../types'
import type { MeshEvent } from '../lib/mesh'
import { mergeCalls } from '../lib/storage'

export const MAX_EVENTS = 200

export interface AppState {
  lang: Lang
  disasterMode: boolean
  received: EmergencyCall[]
  outbox: EmergencyCall[]
  meshEvents: MeshEvent[]
}

export type AppAction =
  | { type: 'SET_LANG'; lang: Lang }
  | { type: 'TOGGLE_DISASTER' }
  | { type: 'RECEIVE_CALL'; call: EmergencyCall }
  | { type: 'ADD_OUTBOX'; call: EmergencyCall }
  | { type: 'MARK_RESCUED'; id: string }
  | { type: 'MESH_EVENT'; event: MeshEvent }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LANG':
      return { ...state, lang: action.lang }
    case 'TOGGLE_DISASTER':
      return { ...state, disasterMode: !state.disasterMode }
    case 'RECEIVE_CALL': {
      const existing = state.received.find((c) => c.id === action.call.id)
      if (existing && (existing.status === 'RESCUED' || action.call.status !== 'RESCUED')) return state
      return { ...state, received: mergeCalls(state.received, [action.call]) }
    }
    case 'ADD_OUTBOX':
      return { ...state, outbox: mergeCalls(state.outbox, [action.call]) }
    case 'MARK_RESCUED':
      return {
        ...state,
        received: state.received.map((c) => (c.id === action.id ? { ...c, status: 'RESCUED' } : c)),
      }
    case 'MESH_EVENT':
      return { ...state, meshEvents: [action.event, ...state.meshEvents].slice(0, MAX_EVENTS) }
    default:
      return state
  }
}
