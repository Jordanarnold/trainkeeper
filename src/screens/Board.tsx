import { useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  doubleLabel,
  gameLabel,
  leaderIds,
  standings,
  suggestedDouble,
  tilesPerPlayer,
  totals,
} from '../lib/rules'
import {
  deleteGame,
  endGame,
  renameGame,
  reopenGame,
  useGame,
} from '../lib/store'
import './Board.css'

function BoardMenu({
  ended,
  onRename,
  onEnd,
  onReopen,
  onDelete,
}: {
  ended: boolean
  onRename: () => void
  onEnd: () => void
  onReopen: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="menu">
      {open && (
        <button
          type="button"
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        className="icon-btn"
        aria-label="Game menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <button type="button" onClick={run(onRename)}>
            Rename
          </button>
          {ended ? (
            <button type="button" onClick={run(onReopen)}>
              Reopen game
            </button>
          ) : (
            <button type="button" onClick={run(onEnd)}>
              End game
            </button>
          )}
          <button type="button" className="danger" onClick={run(onDelete)}>
            Delete game
          </button>
        </div>
      )}
    </div>
  )
}

function RenameSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div className="sheet-host">
      <div className="sheet" role="dialog" aria-label="Rename game">
        <div className="sheet-head">
          <h2>Rename game</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
        <label className="field">
          <span>Game name</span>
          <input
            type="text"
            value={value}
            autoFocus
            placeholder="Taco night"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button type="button" className="btn" onClick={() => onSave(value)}>
          Save
        </button>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

export default function Board() {
  const { id } = useParams()
  const navigate = useNavigate()
  const game = useGame(id)
  const [renaming, setRenaming] = useState(false)

  if (!game) {
    return (
      <div className="app">
        <div className="empty-state">
          <b>Game not found</b>
          It may have been deleted on this device.
        </div>
        <Link className="btn" to="/">
          Back to games
        </Link>
      </div>
    )
  }

  const label = gameLabel(game)
  const draw = tilesPerPlayer(game.players.length)
  const runningTotals = totals(game)
  // Before any round is played everyone is tied at 0; no point flagging that.
  const lowest = game.rounds.length > 0 ? leaderIds(game) : new Set<string>()
  const table = standings(game)
  const ended = Boolean(game.endedAt)
  const nextDouble = suggestedDouble(game)

  function onDelete() {
    if (!game) return
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return
    deleteGame(game.id)
    navigate('/', { replace: true })
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="grow">
          <h1>{label}</h1>
          <p className="subtle">
            Draw {draw} each ·{' '}
            {ended
              ? 'Final'
              : nextDouble === undefined
                ? 'All doubles burned'
                : `Next: ${doubleLabel(nextDouble)}`}
          </p>
        </div>
        <Link className="btn quiet small" to="/">
          Games
        </Link>
        <BoardMenu
          ended={ended}
          onRename={() => setRenaming(true)}
          onEnd={() => endGame(game.id)}
          onReopen={() => reopenGame(game.id)}
          onDelete={onDelete}
        />
      </div>

      {ended && (
        <>
          <div className="section-label">Final standings</div>
          <div className="standings">
            {table.map((row) => (
              <div
                key={row.playerId}
                className={row.rank === 1 ? 'standing win' : 'standing'}
              >
                <span className="rank">{ordinal(row.rank)}</span>
                <span className="name">{row.name}</span>
                <span className="total">{row.total}</span>
              </div>
            ))}
          </div>
          <div className="section-label">Rounds</div>
        </>
      )}

      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="rowhead">Round</th>
              {game.players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {game.rounds.map((round) => (
              <tr
                key={round.id}
                onClick={() => navigate(`/game/${game.id}/round/${round.id}`)}
              >
                <th className="rowhead">{doubleLabel(round.startingDouble)}</th>
                {game.players.map((p) => (
                  <td
                    key={p.id}
                    className={round.goOutPlayerId === p.id ? 'out' : undefined}
                  >
                    {round.scores[p.id] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
            {game.rounds.length === 0 && (
              <tr>
                <td className="rowhead" colSpan={game.players.length + 1}>
                  No rounds yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th className="rowhead">Total</th>
              {game.players.map((p) => (
                <td
                  key={p.id}
                  className={lowest.has(p.id) ? 'lowest' : undefined}
                >
                  {runningTotals[p.id] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {game.rounds.length > 0 && (
        <p className="subtle grid-hint">Tap a round to edit or delete it.</p>
      )}

      <div className="spacer" />

      {!ended && (
        <div className="sticky-actions">
          <button
            type="button"
            className="btn"
            style={{ width: '100%' }}
            disabled={nextDouble === undefined}
            onClick={() => navigate(`/game/${game.id}/round/new`)}
          >
            Next round
          </button>
        </div>
      )}

      {renaming && (
        <RenameSheet
          initial={game.name ?? ''}
          onClose={() => setRenaming(false)}
          onSave={(value) => {
            renameGame(game.id, value)
            setRenaming(false)
          }}
        />
      )}

      <Outlet />
    </div>
  )
}
