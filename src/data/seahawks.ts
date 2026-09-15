// Seahawks jersey-number lookup: who wears a number this season, and the
// most famous Seahawk to wear it in the last 20 years.
//
// The tables live in seahawksData.ts and are hand-curated; refresh CURRENT
// each September once the 53-man roster settles.

import { CURRENT, FAMOUS, SEASON } from './seahawksData'

export type Seahawk = {
  name: string
  position: string
  /** Seasons wearing this number in Seattle, e.g. "2010–2015" or "2022–present". */
  years: string
  /** One short line on why they matter. */
  note?: string
}

export type NumberInfo = {
  number: number
  season: number
  /** Whoever wears the number this season; undefined when nobody does. */
  current?: Seahawk
  /** Most famous wearer over the last 20 years; undefined when unused. */
  famous?: Seahawk
  /** Set when the number is retired, e.g. "Retired for Steve Largent". */
  retired?: string
}

export const MAX_JERSEY = 99

/** True when a round score maps onto a jersey number (0–99). */
export function isJerseyNumber(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= MAX_JERSEY
}

export function seahawksFor(score: number): NumberInfo | undefined {
  if (!isJerseyNumber(score)) return undefined
  const famousEntry = FAMOUS[score]
  const info: NumberInfo = { number: score, season: SEASON, current: CURRENT[score] }
  if (famousEntry && 'retired' in famousEntry) info.retired = famousEntry.retired
  else info.famous = famousEntry
  return info
}
