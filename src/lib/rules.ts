import type { Game, Player, PlayerId, Round } from './types'

/** Double-15 set: rounds open on doubles 15 down to 0. */
export const HIGHEST_DOUBLE = 15
export const LOWEST_DOUBLE = 0
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

/**
 * How many tiles each player draws, by head count. Kept as one table so the
 * house rule is easy to change.
 */
export const DRAW_TABLE: { upTo: number; tiles: number }[] = [
  { upTo: 4, tiles: 15 },
  { upTo: 6, tiles: 12 },
  { upTo: 8, tiles: 10 },
]

export function isValidPlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS
}

/** Tiles drawn per player for a given head count (2-8). */
export function tilesPerPlayer(playerCount: number): number {
  if (!isValidPlayerCount(playerCount)) {
    throw new RangeError(
      `Player count must be an integer between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${playerCount}`,
    )
  }
  const row = DRAW_TABLE.find((r) => playerCount <= r.upTo)
  // The table covers the whole valid range, so this is unreachable in practice.
  if (!row) throw new RangeError(`No draw rule for ${playerCount} players`)
  return row.tiles
}

/** All doubles in play, highest first: 15, 14, ... 0. */
export function allDoubles(): number[] {
  const out: number[] = []
  for (let d = HIGHEST_DOUBLE; d >= LOWEST_DOUBLE; d--) out.push(d)
  return out
}

/**
 * Doubles already used to open a round. Pass `exceptRoundId` when editing a
 * round so that round's own double still counts as available.
 */
export function burnedDoubles(game: Game, exceptRoundId?: string): Set<number> {
  const burned = new Set<number>()
  for (const round of game.rounds) {
    if (exceptRoundId && round.id === exceptRoundId) continue
    burned.add(round.startingDouble)
  }
  return burned
}

/** Doubles still available to open a round, highest first. */
export function availableDoubles(game: Game, exceptRoundId?: string): number[] {
  const burned = burnedDoubles(game, exceptRoundId)
  return allDoubles().filter((d) => !burned.has(d))
}

/** The double the app proposes for the next round: the highest unburned one. */
export function suggestedDouble(
  game: Game,
  exceptRoundId?: string,
): number | undefined {
  return availableDoubles(game, exceptRoundId)[0]
}

/** True once every double has been burned. */
export function allDoublesBurned(game: Game): boolean {
  return availableDoubles(game).length === 0
}

export function isGameOver(game: Game): boolean {
  return game.endedAt !== undefined
}

/**
 * Normalise a round before storing it: scores clamped to non-negative
 * integers, and the player who went out forced to 0.
 */
export function normalizeRound(round: Round, players: Player[]): Round {
  const scores: Record<PlayerId, number> = {}
  for (const player of players) {
    const raw = round.scores[player.id]
    const n = Number.isFinite(raw) ? Math.trunc(raw) : 0
    scores[player.id] = Math.max(0, n)
  }
  if (round.goOutPlayerId && scores[round.goOutPlayerId] !== undefined) {
    scores[round.goOutPlayerId] = 0
  }
  return { ...round, scores }
}

/** Running total per player. Missing scores count as 0. */
export function totals(game: Game): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {}
  for (const player of game.players) out[player.id] = 0
  for (const round of game.rounds) {
    for (const player of game.players) {
      out[player.id] += round.scores[player.id] ?? 0
    }
  }
  return out
}

export type Standing = {
  playerId: PlayerId
  name: string
  total: number
  /** 1-based; tied players share a rank. */
  rank: number
}

/** Players sorted by total ascending (lowest wins). Ties share a rank. */
export function standings(game: Game): Standing[] {
  const byPlayer = totals(game)
  const rows = game.players
    .map((p) => ({ playerId: p.id, name: p.name, total: byPlayer[p.id] ?? 0 }))
    .sort((a, b) => a.total - b.total)

  let rank = 0
  let previousTotal: number | undefined
  return rows.map((row, index) => {
    if (previousTotal === undefined || row.total !== previousTotal) {
      rank = index + 1
      previousTotal = row.total
    }
    return { ...row, rank }
  })
}

/** Current leader (lowest total). Undefined only when there are no players. */
export function leader(game: Game): Standing | undefined {
  return standings(game)[0]
}

/** Player ids currently tied for the lowest total. */
export function leaderIds(game: Game): Set<PlayerId> {
  const all = standings(game)
  return new Set(all.filter((s) => s.rank === 1).map((s) => s.playerId))
}

export function doubleLabel(double: number): string {
  return `Dbl ${double}`
}

/** Display name for a game: its own name, else "Game N", else the date. */
export function gameLabel(game: Game, indexFromOldest?: number): string {
  if (game.name && game.name.trim()) return game.name.trim()
  if (indexFromOldest !== undefined) return `Game ${indexFromOldest + 1}`
  return new Date(game.createdAt).toLocaleDateString()
}
