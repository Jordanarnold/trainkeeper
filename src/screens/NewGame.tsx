import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MAX_PLAYERS, MIN_PLAYERS, tilesPerPlayer } from '../lib/rules'
import { createGame } from '../lib/store'

export default function NewGame() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [names, setNames] = useState<string[]>(Array(MIN_PLAYERS).fill(''))

  const ready = names.every((n) => n.trim().length > 0)
  const draw = tilesPerPlayer(names.length)

  function setNameAt(index: number, value: string) {
    setNames((current) => current.map((n, i) => (i === index ? value : n)))
  }

  function start() {
    if (!ready) return
    const game = createGame(names, name)
    navigate(`/game/${game.id}`, { replace: true })
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="grow">
          <h1>New game</h1>
          <p className="subtle">2 to 8 players, double-15 set</p>
        </div>
        <Link className="btn quiet small" to="/">
          Cancel
        </Link>
      </div>

      <div className="stack">
        <label className="field">
          <span>Game name (optional)</span>
          <input
            type="text"
            value={name}
            placeholder="Taco night"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="section-label">Players</div>
        {names.map((playerName, index) => (
          <div className="player-row" key={index}>
            <input
              type="text"
              value={playerName}
              placeholder={`Player ${index + 1}`}
              autoComplete="off"
              onChange={(e) => setNameAt(index, e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove player ${index + 1}`}
              disabled={names.length <= MIN_PLAYERS}
              onClick={() =>
                setNames((current) => current.filter((_, i) => i !== index))
              }
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn quiet"
          disabled={names.length >= MAX_PLAYERS}
          onClick={() => setNames((current) => [...current, ''])}
        >
          + Add player
        </button>

        <p className="subtle">
          {names.length} players · Each player draws <strong>{draw}</strong>{' '}
          dominos
        </p>
      </div>

      <div className="spacer" />

      <div className="sticky-actions">
        <button
          type="button"
          className="btn"
          style={{ width: '100%' }}
          disabled={!ready}
          onClick={start}
        >
          Start game
        </button>
      </div>
    </div>
  )
}
