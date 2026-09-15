export type PlayerId = string

export type Player = {
  id: PlayerId
  name: string
}

export type Round = {
  id: string
  /** The double that opened this round, 15 down to 0. */
  startingDouble: number
  /** Pip total of each player's leftover tiles at the end of the round. */
  scores: Record<PlayerId, number>
  /** The player who went out. Their score is always 0. */
  goOutPlayerId?: PlayerId
}

export type Game = {
  id: string
  name?: string
  createdAt: number
  endedAt?: number
  players: Player[]
  rounds: Round[]
}

/** Shape of the single localStorage blob. */
export type StoreData = {
  version: 1
  games: Game[]
}
