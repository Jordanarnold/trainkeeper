import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PipCounter from '../components/PipCounter'
import type { PlayerId } from '../lib/types'
import { allDoubles, burnedDoubles, doubleLabel, suggestedDouble } from '../lib/rules'
import { addRound, deleteRound, updateRound, useGame } from '../lib/store'

function isFilled(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

export default function RoundSheet() {
  const { id, roundId } = useParams()
  const navigate = useNavigate()
  const game = useGame(id)
  const existing = game?.rounds.find((r) => r.id === roundId)

  const [double, setDouble] = useState<number | undefined>(
    () => existing?.startingDouble ?? (game ? suggestedDouble(game) : undefined),
  )
  const [scores, setScores] = useState<Record<PlayerId, string>>(() => {
    const seed: Record<PlayerId, string> = {}
    for (const player of game?.players ?? []) {
      const value = existing?.scores[player.id]
      seed[player.id] = value === undefined ? '' : String(value)
    }
    return seed
  })
  const [goOut, setGoOut] = useState<PlayerId | undefined>(
    existing?.goOutPlayerId,
  )
  const [camera, setCamera] = useState<PlayerId | undefined>()
  const [error, setError] = useState('')

  if (!game) return null
  const current = game

  const close = () => navigate(`/game/${current.id}`)
  const burned = burnedDoubles(current, existing?.id)
  const cameraPlayer = current.players.find((p) => p.id === camera)

  function setScore(playerId: PlayerId, value: string) {
    setScores((prev) => ({ ...prev, [playerId]: value }))
  }

  function toggleGoOut(playerId: PlayerId) {
    if (goOut === playerId) {
      setGoOut(undefined)
      return
    }
    setGoOut(playerId)
    setScore(playerId, '0')
  }

  function save() {
    if (double === undefined) {
      setError('Pick the double that opened the round.')
      return
    }
    const missing = current.players.filter((p) => !isFilled(scores[p.id] ?? ''))
    if (missing.length > 0) {
      setError(`Still need a score for ${missing.map((p) => p.name).join(', ')}.`)
      return
    }
    const numeric: Record<PlayerId, number> = {}
    for (const player of current.players) {
      numeric[player.id] = Number(scores[player.id])
    }
    const input = { startingDouble: double, scores: numeric, goOutPlayerId: goOut }
    if (existing) updateRound(current.id, existing.id, input)
    else addRound(current.id, input)
    close()
  }

  function removeRound() {
    if (!existing) return
    if (!window.confirm('Delete this round?')) return
    deleteRound(current.id, existing.id)
    close()
  }

  return (
    <>
      <div className="sheet-host">
        <div className="sheet" role="dialog" aria-label="Round scores">
          <div className="sheet-head">
            <h2>{existing ? 'Edit round' : 'New round'}</h2>
            <button type="button" className="link-btn" onClick={close}>
              Cancel
            </button>
          </div>

          <div>
            <div className="section-label" style={{ margin: '0 2px 8px' }}>
              Starting double
            </div>
            <div className="chip-row">
              {allDoubles().map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={double === d}
                  disabled={burned.has(d)}
                  onClick={() => setDouble(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="subtle">
              {double === undefined
                ? 'Every double is burned.'
                : `${doubleLabel(double)} opened this round.`}
            </p>
          </div>

          <div className="stack">
            {game.players.map((player) => {
              const isOut = goOut === player.id
              return (
                <div className="score-row" key={player.id}>
                  <div className="who">
                    <span>{player.name}</span>
                    <label className={isOut ? 'out-toggle on' : 'out-toggle'}>
                      <input
                        type="radio"
                        name="goOut"
                        aria-label={`${player.name} went out`}
                        checked={isOut}
                        onChange={() => toggleGoOut(player.id)}
                        onClick={() => isOut && toggleGoOut(player.id)}
                      />
                      Went out
                    </label>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    step={1}
                    placeholder="0"
                    aria-label={`${player.name} score`}
                    value={scores[player.id] ?? ''}
                    disabled={isOut}
                    onChange={(e) => setScore(player.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Count pips for ${player.name}`}
                    disabled={isOut}
                    onClick={() => setCamera(player.id)}
                  >
                    📷
                  </button>
                </div>
              )
            })}
          </div>

          <p className="error">{error}</p>

          <button type="button" className="btn" onClick={save}>
            Save round
          </button>
          {existing && (
            <button type="button" className="btn danger" onClick={removeRound}>
              Delete round
            </button>
          )}
        </div>
      </div>

      {cameraPlayer && (
        <div className="pip-host">
          <PipCounter
            title={cameraPlayer.name}
            onUse={(total) => {
              setScore(cameraPlayer.id, String(Math.max(0, Math.trunc(total))))
              setCamera(undefined)
            }}
            onClose={() => setCamera(undefined)}
          />
        </div>
      )}
    </>
  )
}
