import { describe, expect, it } from 'vitest'
import type { Game, Round } from './types'
import {
  allDoubles,
  allDoublesBurned,
  availableDoubles,
  burnedDoubles,
  gameLabel,
  leader,
  leaderIds,
  normalizeRound,
  standings,
  suggestedDouble,
  tilesPerPlayer,
  totals,
} from './rules'

function makeGame(playerNames: string[], rounds: Round[] = []): Game {
  return {
    id: 'g1',
    createdAt: 1_700_000_000_000,
    players: playerNames.map((name, i) => ({ id: `p${i + 1}`, name })),
    rounds,
  }
}

function round(id: string, startingDouble: number, scores: number[]): Round {
  const map: Record<string, number> = {}
  scores.forEach((s, i) => (map[`p${i + 1}`] = s))
  return { id, startingDouble, scores: map }
}

describe('tilesPerPlayer', () => {
  it('follows the draw table', () => {
    expect(tilesPerPlayer(2)).toBe(15)
    expect(tilesPerPlayer(3)).toBe(15)
    expect(tilesPerPlayer(4)).toBe(15)
    expect(tilesPerPlayer(5)).toBe(12)
    expect(tilesPerPlayer(6)).toBe(12)
    expect(tilesPerPlayer(7)).toBe(10)
    expect(tilesPerPlayer(8)).toBe(10)
  })

  it('rejects counts outside 2-8', () => {
    expect(() => tilesPerPlayer(1)).toThrow(RangeError)
    expect(() => tilesPerPlayer(9)).toThrow(RangeError)
    expect(() => tilesPerPlayer(3.5)).toThrow(RangeError)
  })
})

describe('doubles', () => {
  it('runs 15 down to 0', () => {
    expect(allDoubles()).toHaveLength(16)
    expect(allDoubles()[0]).toBe(15)
    expect(allDoubles().at(-1)).toBe(0)
  })

  it('burns the doubles that opened rounds', () => {
    const game = makeGame(['A', 'B'], [
      round('r1', 15, [10, 0]),
      round('r2', 13, [0, 4]),
    ])
    expect([...burnedDoubles(game)].sort((a, b) => b - a)).toEqual([15, 13])
    expect(availableDoubles(game)[0]).toBe(14)
    expect(availableDoubles(game)).not.toContain(15)
    expect(availableDoubles(game)).toHaveLength(14)
  })

  it('suggests the highest available double', () => {
    const empty = makeGame(['A', 'B'])
    expect(suggestedDouble(empty)).toBe(15)
    const started = makeGame(['A', 'B'], [round('r1', 15, [1, 0])])
    expect(suggestedDouble(started)).toBe(14)
  })

  it('leaves a round its own double when editing', () => {
    const game = makeGame(['A', 'B'], [
      round('r1', 15, [1, 0]),
      round('r2', 14, [0, 5]),
    ])
    expect(availableDoubles(game, 'r1')).toContain(15)
    expect(availableDoubles(game, 'r1')).not.toContain(14)
    expect(suggestedDouble(game, 'r1')).toBe(15)
  })

  it('knows when the set is exhausted', () => {
    const rounds = allDoubles().map((d, i) => round(`r${i}`, d, [0, 0]))
    expect(allDoublesBurned(makeGame(['A', 'B'], rounds))).toBe(true)
    expect(suggestedDouble(makeGame(['A', 'B'], rounds))).toBeUndefined()
    expect(allDoublesBurned(makeGame(['A', 'B'], rounds.slice(1)))).toBe(false)
  })
})

describe('normalizeRound', () => {
  const players = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
  ]

  it('zeroes the player who went out', () => {
    const r = normalizeRound(
      { id: 'r1', startingDouble: 12, scores: { p1: 34, p2: 9 }, goOutPlayerId: 'p1' },
      players,
    )
    expect(r.scores).toEqual({ p1: 0, p2: 9 })
  })

  it('clamps to non-negative integers and fills missing players', () => {
    const r = normalizeRound(
      { id: 'r1', startingDouble: 12, scores: { p1: -5.7 } },
      players,
    )
    expect(r.scores).toEqual({ p1: 0, p2: 0 })
  })
})

describe('totals and standings', () => {
  const game = makeGame(['Ann', 'Bob', 'Cy'], [
    round('r1', 15, [10, 0, 22]),
    round('r2', 14, [5, 12, 0]),
  ])

  it('sums each player', () => {
    expect(totals(game)).toEqual({ p1: 15, p2: 12, p3: 22 })
  })

  it('sorts ascending, lowest wins', () => {
    expect(standings(game).map((s) => s.name)).toEqual(['Bob', 'Ann', 'Cy'])
    expect(standings(game).map((s) => s.rank)).toEqual([1, 2, 3])
    expect(leader(game)?.name).toBe('Bob')
  })

  it('shares a rank on ties and skips the next', () => {
    const tied = makeGame(['Ann', 'Bob', 'Cy'], [round('r1', 15, [5, 5, 9])])
    expect(standings(tied).map((s) => s.rank)).toEqual([1, 1, 3])
    expect(leaderIds(tied)).toEqual(new Set(['p1', 'p2']))
  })

  it('counts a game with no rounds as all zeroes', () => {
    const fresh = makeGame(['Ann', 'Bob'])
    expect(totals(fresh)).toEqual({ p1: 0, p2: 0 })
    expect(standings(fresh).map((s) => s.rank)).toEqual([1, 1])
  })
})

describe('gameLabel', () => {
  it('prefers the name, then the ordinal', () => {
    expect(gameLabel({ ...makeGame(['A', 'B']), name: 'Taco night' }, 0)).toBe(
      'Taco night',
    )
    expect(gameLabel(makeGame(['A', 'B']), 3)).toBe('Game 4')
    expect(gameLabel(makeGame(['A', 'B']))).toMatch(/\d/)
  })
})
