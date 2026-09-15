import { useSyncExternalStore } from 'react'
import type { Game, Player, PlayerId, Round, StoreData } from './types'
import { normalizeRound } from './rules'

export const STORAGE_KEY = 'trainkeeper'
/** Key used before the app was renamed; read once so existing games carry over. */
const LEGACY_STORAGE_KEY = 'dominocalc'
export const STORAGE_VERSION = 1

/** Minimal storage surface, so the store also works under plain Node (tests). */
type Backend = Pick<Storage, 'getItem' | 'setItem'>

function makeBackend(): Backend {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Private-mode Safari and friends can throw on access.
  }
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  }
}

const backend = makeBackend()

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const EMPTY: StoreData = { version: STORAGE_VERSION, games: [] }

function isGame(value: unknown): value is Game {
  if (!value || typeof value !== 'object') return false
  const g = value as Partial<Game>
  return (
    typeof g.id === 'string' &&
    typeof g.createdAt === 'number' &&
    Array.isArray(g.players) &&
    Array.isArray(g.rounds)
  )
}

/** Parse the stored blob, tolerating anything unexpected. */
export function parseStored(raw: string | null): StoreData {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY
    const games = (parsed as Partial<StoreData>).games
    if (!Array.isArray(games)) return EMPTY
    return { version: STORAGE_VERSION, games: games.filter(isGame) }
  } catch {
    return EMPTY
  }
}

/** Newest first. */
export function sortGames(games: Game[]): Game[] {
  return [...games].sort((a, b) => b.createdAt - a.createdAt)
}

/** Import merge: incoming games win on id collision, the rest are appended. */
export function mergeGames(current: Game[], incoming: Game[]): Game[] {
  const byId = new Map(current.map((g) => [g.id, g]))
  for (const game of incoming) {
    if (isGame(game)) byId.set(game.id, game)
  }
  return sortGames([...byId.values()])
}

// ---------------------------------------------------------------- the store

let state: StoreData = parseStored(
  backend.getItem(STORAGE_KEY) ?? backend.getItem(LEGACY_STORAGE_KEY),
)
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function commit(games: Game[]) {
  state = { version: STORAGE_VERSION, games: sortGames(games) }
  try {
    backend.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Out of quota, or storage blocked: keep the in-memory copy either way.
  }
  emit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function getGames(): Game[] {
  return state.games
}

export function getGame(id: string): Game | undefined {
  return state.games.find((g) => g.id === id)
}

/** Re-read from storage (used for cross-tab sync). */
export function reload() {
  state = parseStored(backend.getItem(STORAGE_KEY))
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) reload()
  })
}

// ------------------------------------------------------------------- writes

function replaceGame(id: string, update: (game: Game) => Game) {
  const next = state.games.map((g) => (g.id === id ? update(g) : g))
  commit(next)
}

export function createGame(names: string[], name?: string): Game {
  const players: Player[] = names.map((playerName) => ({
    id: newId(),
    name: playerName.trim(),
  }))
  const game: Game = {
    id: newId(),
    name: name?.trim() ? name.trim() : undefined,
    createdAt: Date.now(),
    players,
    rounds: [],
  }
  commit([game, ...state.games])
  return game
}

export function renameGame(id: string, name: string) {
  replaceGame(id, (g) => ({ ...g, name: name.trim() || undefined }))
}

export function deleteGame(id: string) {
  commit(state.games.filter((g) => g.id !== id))
}

export function endGame(id: string) {
  replaceGame(id, (g) => (g.endedAt ? g : { ...g, endedAt: Date.now() }))
}

export function reopenGame(id: string) {
  replaceGame(id, (g) => {
    const { endedAt: _endedAt, ...rest } = g
    return rest
  })
}

type RoundInput = {
  startingDouble: number
  scores: Record<PlayerId, number>
  goOutPlayerId?: PlayerId
}

/** Save a round; the last double (0) also ends the game. */
export function addRound(gameId: string, input: RoundInput): Round | undefined {
  const game = getGame(gameId)
  if (!game) return undefined
  const round = normalizeRound({ id: newId(), ...input }, game.players)
  replaceGame(gameId, (g) => ({
    ...g,
    rounds: [...g.rounds, round],
    endedAt: round.startingDouble === 0 ? (g.endedAt ?? Date.now()) : g.endedAt,
  }))
  return round
}

export function updateRound(
  gameId: string,
  roundId: string,
  input: RoundInput,
) {
  const game = getGame(gameId)
  if (!game) return
  replaceGame(gameId, (g) => ({
    ...g,
    rounds: g.rounds.map((r) =>
      r.id === roundId
        ? normalizeRound({ id: roundId, ...input }, g.players)
        : r,
    ),
  }))
}

export function deleteRound(gameId: string, roundId: string) {
  replaceGame(gameId, (g) => ({
    ...g,
    rounds: g.rounds.filter((r) => r.id !== roundId),
  }))
}

// ---------------------------------------------------------- export / import

export function exportJson(): string {
  return JSON.stringify({ version: STORAGE_VERSION, games: state.games }, null, 2)
}

/** Merge a JSON export into the store. Returns how many games came in. */
export function importJson(raw: string): number {
  const incoming = parseStored(raw)
  commit(mergeGames(state.games, incoming.games))
  return incoming.games.length
}

// -------------------------------------------------------------- React hooks

export function useGames(): Game[] {
  return useSyncExternalStore(subscribe, getGames, getGames)
}

export function useGame(id: string | undefined): Game | undefined {
  const games = useGames()
  return id ? games.find((g) => g.id === id) : undefined
}

/** Test seam: wipe everything. */
export function resetStoreForTests() {
  commit([])
}
