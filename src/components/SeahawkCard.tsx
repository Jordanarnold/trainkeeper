import { useEffect } from 'react'
import { MAX_JERSEY, seahawksFor, type Seahawk } from '../data/seahawks'
import './SeahawkCard.css'

export const LOGO_SRC = `${import.meta.env.BASE_URL}Seattle-Seahawks-Logo.png`

export type SeahawkCardProps = {
  /** The player's round score, used as a jersey number. */
  score: number
  /** Whose score this is; shown in the header. */
  playerName: string
  onClose: () => void
}

function HawkLine({ hawk, empty }: { hawk?: Seahawk; empty: string }) {
  if (!hawk) return <p className="hawk-empty">{empty}</p>
  return (
    <div className="hawk">
      <div className="hawk-name">{hawk.name}</div>
      <div className="hawk-meta">
        {hawk.position} · {hawk.years}
      </div>
      {hawk.note && <div className="hawk-note">{hawk.note}</div>}
    </div>
  )
}

export default function SeahawkCard({ score, playerName, onClose }: SeahawkCardProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const info = seahawksFor(score)

  return (
    <div className="hawk-host" onClick={onClose}>
      <div
        className="hawk-card"
        role="dialog"
        aria-label={`Seahawks who wore ${score}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hawk-head">
          <div className="hawk-title">
            <img className="hawk-logo" src={LOGO_SRC} alt="" />
            <div>
              <div className="hawk-number">#{score}</div>
              <div className="subtle">{playerName}'s round score</div>
            </div>
          </div>
          <button type="button" className="hawk-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {!info ? (
          <p className="hawk-empty">
            Jersey numbers stop at {MAX_JERSEY}. No Seahawk has ever worn {score}.
          </p>
        ) : info.retired ? (
          <>
            <div className="section-label hawk-label">Retired number</div>
            <p className="hawk-empty">{info.retired}</p>
          </>
        ) : (
          <>
            <div className="section-label hawk-label">Wears it now · {info.season}</div>
            <HawkLine hawk={info.current} empty={`Nobody wears ${score} this season.`} />
            <div className="section-label hawk-label">Most famous · last 20 years</div>
            <HawkLine hawk={info.famous} empty={`No Seahawk has worn ${score} since 2006.`} />
          </>
        )}
      </div>
    </div>
  )
}
