import { describe, expect, it } from 'vitest'
import { CURRENT, FAMOUS } from './seahawksData'
import { isJerseyNumber, seahawksFor } from './seahawks'

describe('isJerseyNumber', () => {
  it('accepts 0 through 99 only', () => {
    expect(isJerseyNumber(0)).toBe(true)
    expect(isJerseyNumber(99)).toBe(true)
    expect(isJerseyNumber(100)).toBe(false)
    expect(isJerseyNumber(-1)).toBe(false)
    expect(isJerseyNumber(12.5)).toBe(false)
    expect(isJerseyNumber(Number.NaN)).toBe(false)
  })
})

describe('seahawksFor', () => {
  it('returns nothing outside the jersey range', () => {
    expect(seahawksFor(143)).toBeUndefined()
    expect(seahawksFor(-3)).toBeUndefined()
  })

  it('marks retired numbers and never lists a famous wearer for them', () => {
    for (const n of [12, 45, 80, 96]) {
      const info = seahawksFor(n)
      expect(info?.retired, `#${n}`).toBeTruthy()
      expect(info?.famous, `#${n}`).toBeUndefined()
      expect(info?.current, `#${n}`).toBeUndefined()
    }
  })

  it('has a famous wearer for the Legion of Boom numbers', () => {
    expect(seahawksFor(3)?.famous?.name).toBe('Russell Wilson')
    expect(seahawksFor(24)?.famous?.name).toBe('Marshawn Lynch')
    expect(seahawksFor(25)?.famous?.name).toBe('Richard Sherman')
    expect(seahawksFor(29)?.famous?.name).toBe('Earl Thomas')
    expect(seahawksFor(31)?.famous?.name).toBe('Kam Chancellor')
    expect(seahawksFor(54)?.famous?.name).toBe('Bobby Wagner')
  })

  it('keeps every table entry inside 0–99 with the required fields', () => {
    for (const [key, hawk] of Object.entries(CURRENT)) {
      expect(isJerseyNumber(Number(key))).toBe(true)
      expect(hawk?.name).toBeTruthy()
      expect(hawk?.position).toBeTruthy()
      expect(hawk?.years).toMatch(/present$/)
    }
    for (const [key, entry] of Object.entries(FAMOUS)) {
      expect(isJerseyNumber(Number(key))).toBe(true)
      if (entry && 'retired' in entry) expect(entry.retired).toBeTruthy()
      else {
        expect(entry?.name).toBeTruthy()
        expect(entry?.years).toMatch(/^\d{4}(–(\d{4}|present))?(, \d{4}(–(\d{4}|present))?)*$/)
      }
    }
  })
})
