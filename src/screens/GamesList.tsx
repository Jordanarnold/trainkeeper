import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Game } from '../lib/types'
import { gameLabel, leader, tilesPerPlayer } from '../lib/rules'
import { exportJson, importJson, useGames } from '../lib/store'

function downloadJson(text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trainkeeper-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function GameCard({ game, label }: { game: Game; label: string }) {
  const top = leader(game)
  const drawn = game.players.length
    ? `${tilesPerPlayer(game.players.length)} each`
    : ''
  const roundWord = game.rounds.length === 1 ? 'round' : 'rounds'

  return (
    <Link className="card" to={`/game/${game.id}`}>
      <div className="card-head">
        <h2>{label}</h2>
        <span className={game.endedAt ? 'tag done' : 'tag'}>
          {game.endedAt ? 'Final' : 'Playing'}
        </span>
      </div>
      <div className="meta">{game.players.map((p) => p.name).join(' · ')}</div>
      <div className="meta">
        {game.rounds.length} {roundWord} · {drawn}
        {top
          ? ` · ${game.endedAt ? 'Winner' : 'Leader'}: ${top.name} (${top.total})`
          : ''}
      </div>
    </Link>
  )
}

export default function GamesList() {
  const games = useGames()
  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')

  const oldestFirst = [...games].sort((a, b) => a.createdAt - b.createdAt)
  const labelFor = (game: Game) =>
    gameLabel(
      game,
      oldestFirst.findIndex((g) => g.id === game.id),
    )

  const inProgress = games.filter((g) => !g.endedAt)
  const finished = games.filter((g) => g.endedAt)

  async function onImport(file: File) {
    try {
      const count = importJson(await file.text())
      setNotice(
        count ? `Imported ${count} game${count === 1 ? '' : 's'}.` : 'Nothing to import from that file.',
      )
    } catch {
      setNotice('Could not read that file.')
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="grow">
          <h1>Trainkeeper</h1>
          <p className="subtle">Mexican Train score keeper</p>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="empty-state">
          <b>No games yet</b>
          Start one, add everyone playing, and Trainkeeper keeps the running
          totals and the burned doubles for you.
        </div>
      ) : (
        <>
          {inProgress.length > 0 && (
            <>
              <div className="section-label">In progress</div>
              <div className="stack">
                {inProgress.map((game) => (
                  <GameCard key={game.id} game={game} label={labelFor(game)} />
                ))}
              </div>
            </>
          )}
          {finished.length > 0 && (
            <>
              <div className="section-label">Finished</div>
              <div className="stack">
                {finished.map((game) => (
                  <GameCard key={game.id} game={game} label={labelFor(game)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="spacer" />

      <div className="sticky-actions stack">
        <Link className="btn" to="/new">
          New game
        </Link>
        {notice && <p className="subtle">{notice}</p>}
        <div className="btn-row">
          <button
            type="button"
            className="btn quiet small"
            onClick={() => downloadJson(exportJson())}
            disabled={games.length === 0}
          >
            Export
          </button>
          <button
            type="button"
            className="btn quiet small"
            onClick={() => fileInput.current?.click()}
          >
            Import
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onImport(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
