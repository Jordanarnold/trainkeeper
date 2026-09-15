import { beforeEach, describe, expect, it } from 'vitest'
import type { Game } from './types'
import {
  addRound,
  createGame,
  deleteGame,
  deleteRound,
  endGame,
  exportJson,
  getGame,
  getGames,
  importJson,
  mergeGames,
  parseStored,
  resetStoreForTests,
  updateRound,
} from './store'
import { totals } from './rules'

beforeEach(() => resetStoreForTests())

function stub(id: string, createdAt: number, name?: string): Game {
  return { id, createdAt, name, players: [], rounds: [] }
}

describe('parseStored', () => {
  it('survives junk', () => {
    expect(parseStored(null).games).toEqual([])
    expect(parseStored('not json').games).toEqual([])
    expect(parseStored('{"games":"nope"}').games).toEqual([])
    expect(parseStored('{"version":1,"games":[{"bogus":true}]}').games).toEqual([])
  })

  it('keeps well formed games', () => {
    const raw = JSON.stringify({ version: 1, games: [stub('a', 1)] })
    expect(parseStored(raw).games.map((g) => g.id)).toEqual(['a'])
  })
})

describe('mergeGames', () => {
  it('replaces by id and appends the rest, newest first', () => {
    const merged = mergeGames(
      [stub('a', 1, 'old'), stub('b', 2)],
      [stub('a', 3, 'new'), stub('c', 4)],
    )
    expect(merged.map((g) => g.id)).toEqual(['c', 'a', 'b'])
    expect(merged.find((g) => g.id === 'a')?.name).toBe('new')
  })
})

describe('game lifecycle', () => {
  it('creates, scores, edits, deletes', () => {
    const game = createGame(['Ann', 'Bob', ' Cy '], '  Taco night ')
    expect(game.name).toBe('Taco night')
    expect(game.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cy'])
    expect(getGames()).toHaveLength(1)

    const [p1, p2, p3] = game.players
    addRound(game.id, {
      startingDouble: 15,
      scores: { [p1.id]: 12, [p2.id]: 30, [p3.id]: 4 },
      goOutPlayerId: p1.id,
    })
    let stored = getGame(game.id)!
    expect(stored.rounds).toHaveLength(1)
    expect(totals(stored)).toEqual({ [p1.id]: 0, [p2.id]: 30, [p3.id]: 4 })

    const roundId = stored.rounds[0].id
    updateRound(game.id, roundId, {
      startingDouble: 15,
      scores: { [p1.id]: 12, [p2.id]: 8, [p3.id]: 4 },
    })
    stored = getGame(game.id)!
    expect(totals(stored)).toEqual({ [p1.id]: 12, [p2.id]: 8, [p3.id]: 4 })

    deleteRound(game.id, roundId)
    expect(getGame(game.id)!.rounds).toHaveLength(0)

    deleteGame(game.id)
    expect(getGames()).toHaveLength(0)
  })

  it('ends the game when the last double is burned', () => {
    const game = createGame(['Ann', 'Bob'])
    addRound(game.id, { startingDouble: 15, scores: {} })
    expect(getGame(game.id)!.endedAt).toBeUndefined()
    addRound(game.id, { startingDouble: 0, scores: {} })
    expect(getGame(game.id)!.endedAt).toBeTypeOf('number')
  })

  it('ends the game on request', () => {
    const game = createGame(['Ann', 'Bob'])
    endGame(game.id)
    expect(getGame(game.id)!.endedAt).toBeTypeOf('number')
  })
})

describe('export / import', () => {
  it('round-trips through JSON and merges', () => {
    const game = createGame(['Ann', 'Bob'], 'Round trip')
    const json = exportJson()
    resetStoreForTests()
    expect(getGames()).toHaveLength(0)

    expect(importJson(json)).toBe(1)
    expect(getGame(game.id)?.name).toBe('Round trip')

    // Importing the same file twice must not duplicate the game.
    importJson(json)
    expect(getGames()).toHaveLength(1)
  })

  it('ignores an unparseable import', () => {
    createGame(['Ann', 'Bob'])
    expect(importJson('<html>nope</html>')).toBe(0)
    expect(getGames()).toHaveLength(1)
  })
})
