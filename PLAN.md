# Trainkeeper — Mexican Train score keeper

Phone-first web app for tracking Mexican Train games, with a camera pip counter
for fast end-of-round scoring.

## Decisions (agreed 2026-09-14)

- **Storage:** on-device only (browser localStorage / IndexedDB). No accounts,
  no server. Export/import JSON so history can move between phones.
- **Vision:** on-device classical counter ported from `pip-counter.html`
  (white tile faces → dark pips → tap-to-correct). No AI calls.
- **Stack:** Vite + React + TypeScript, installable PWA. Static hosting
  (Netlify / Vercel / GitHub Pages). Single `main` branch.
- **Draw table (double-15 set, 136 tiles):**
  2–4 players: 15 each · 5–6 players: 12 each · 7–8 players: 10 each.
  Kept in one config file so it is easy to change.

## Rules encoded

- 2 to 8 players. Double-15 set. Lowest total wins.
- Rounds start on the highest *unburned* double. App proposes 15, 14, … and the
  scorekeeper taps the double that actually opened the round. That double is
  burned for the rest of the game. Max 16 rounds (15 down to 0).
- Round scores are the pip sum of each player's leftover tiles. The player who
  goes out scores 0. Scores stay editable after entry. A round can be deleted.
- Game ends when the last double is burned or when the scorekeeper ends it.
  Ending shows final standings.

## Screens

1. **Games** — list of games (in progress first), each showing players, round
   count, leader. New game button. Export / import.
2. **New game** — player names (2–8), shows "draw N dominos each" for the
   chosen count. Optional game name. Starts the game.
3. **Game board** — score grid: rounds as rows, players as columns, running
   totals in a sticky footer, leader highlighted. Each row shows its starting
   double. "Next round" opens the round sheet.
4. **Round sheet** — pick the starting double (default = highest unburned),
   one score field per player, a camera button beside each field. Save round.
5. **Pip counter** (modal) — take/choose photo, see rings and tile boxes, tap
   to add/remove pips, "Use N" fills the player's field.

## Data model

```ts
type Game = {
  id: string; name?: string; createdAt: number; endedAt?: number;
  players: { id: string; name: string }[];
  rounds: {
    id: string; startingDouble: number;          // 15..0
    scores: Record<playerId, number>;
    goOutPlayerId?: playerId;
  }[];
};
// Burned doubles are derived from rounds[].startingDouble.
```

## Build order

1. **Skeleton** — Vite/React/TS project, routing, storage layer, PWA manifest.
2. **Game logic + screens** — new game, board, round sheet, hand entry, totals,
   burned doubles, end game. Unit tests on scoring / double selection.
3. **Camera** — port the pip counter into a React component behind the camera
   button; result flows into the score field.
4. **Vision tuning** — run against photos of Jordan's actual set; adjust
   thresholds; consider auto whiteness detection.
5. **Polish + deploy** — home-screen install, export/import, hosting.

## Status

- Steps 1–3 built 2026-09-14 and verified end to end in the browser.
- Step 4 in progress against `test-images/` (Jordan's crops; expected totals
  are in the file names). Synthesised composites from the full-set photo were
  not representative; use Jordan's crops only.

## Open items

- Vision: faces clipped by the photo edge; touching tiles merging into one
  face; colour-to-number cross-check (each value has its own pip colour).
- Hosting target (Netlify vs Vercel vs GitHub Pages) — pick at step 5.
