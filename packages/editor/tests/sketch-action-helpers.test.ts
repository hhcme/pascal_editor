import { describe, expect, test } from 'bun:test'
import {
  formatAngleInputValue,
  parseSketchAngleInput,
} from '../src/components/editor/floorplan/sketch-action-helpers'

describe('sketch action helpers', () => {
  test('formats angle input values with one decimal place', () => {
    expect(formatAngleInputValue(45)).toBe('45')
    expect(formatAngleInputValue(12.34)).toBe('12.3')
  })

  test('parses and normalizes angle input values', () => {
    expect(parseSketchAngleInput('90')).toBe(90)
    expect(parseSketchAngleInput('-45')).toBe(315)
    expect(parseSketchAngleInput('405')).toBe(45)
    expect(parseSketchAngleInput('')).toBeNull()
    expect(parseSketchAngleInput('abc')).toBeNull()
  })
})
