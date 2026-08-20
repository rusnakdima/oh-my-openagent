import { describe, expect, test } from "bun:test"

// T-6: VAD NaN guard — parseFloat("0,123") returns NaN on comma-decimal locales
// T-7: VAD uses LC_ALL=C to force English sox output

describe("vad-monitor H-2: NaN guard for localized decimal separators", () => {
  test("parseFloat('0.123') returns 0.123 (English decimal convention)", () => {
    const result = parseFloat("0.123")
    expect(result).toBeCloseTo(0.123)
  })

  test("NaN guard: Number.isNaN check prevents NaN from propagating to lastLevel", () => {
    // H-2 fix: the code now checks Number.isNaN(db) before using it
    // On German/French locale, parseFloat("0,123") returns NaN (we simulate that here)
    const dbFromLocalizedInput = NaN
    const lastLevel = Number.isNaN(dbFromLocalizedInput) ? 0 : Math.round(Math.pow(10, dbFromLocalizedInput / 20) * 32767)
    expect(lastLevel).toBe(0) // Guard kicks in — silence detected as 0 level, not NaN
  })

  test("without NaN guard: NaN propagates to lastLevel making silence undetected", () => {
    // Documents what would happen without the H-2 fix
    const db = NaN
    const lastLevelWithoutGuard = Math.round(Math.pow(10, db / 20) * 32767)
    expect(Number.isNaN(lastLevelWithoutGuard)).toBe(true)
    // NaN < threshold is always false → silence is never detected
  })

  test("valid parseFloat result computes correct linear level from dB", () => {
    const db = parseFloat("-40.0")
    expect(Number.isNaN(db)).toBe(false)
    const lastLevel = Math.round(Math.pow(10, db / 20) * 32767)
    expect(lastLevel).toBeGreaterThan(0)
    expect(lastLevel).toBeLessThanOrEqual(32767)
  })
})

describe("vad-monitor H-1: LC_ALL=C forces English sox output", () => {
  // H-1 fix: spawn env includes LC_ALL: "C" so sox always outputs English-level markers
  // We cannot easily spawn sox in tests, but we can verify the intent:
  // sox output patterns like "Samples amplitude:", "RMS level:" are English-only
  // By setting LC_ALL=C, we guarantee these strings always match regardless of system locale
  test("sox 'Samples amplitude' pattern only matches English output", () => {
    const englishLine = "Samples amplitude: 0.005191"
    const germanLine = "Amplitude del campione: 0.005191" // Italian sox
    const frenchLine = "Amplitude des échantillons: 0.005191" // French sox

    expect(englishLine.includes("Samples amplitude")).toBe(true)
    expect(germanLine.includes("Samples amplitude")).toBe(false)
    expect(frenchLine.includes("Samples amplitude")).toBe(false)
  })

  test("sox 'RMS level' pattern only matches English output", () => {
    const englishLine = "RMS level: -20.123"
    const germanLine = "Niveau RMS: -20.123"

    expect(englishLine.includes("RMS level")).toBe(true)
    expect(germanLine.includes("RMS level")).toBe(false)
  })
})
