import { describe, expect, it } from "bun:test"
import {
  DEFAULT_OPTIONS,
  EMPTY,
  daysLeft,
  formatDaysLeft,
  isSnapshot,
  num,
  parseOptions,
  pctOf,
  tierColor,
  tierColorVariant,
  tierOf,
  usd,
  widgetText,
  type Snapshot,
} from "./core"

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return { ...EMPTY, ok: true, remaining: 75, limit: 100, reset: "weekly", fetchedAt: 1, ...overrides }
}

describe("tierOf", () => {
  it("is green above 50%", () => {
    const s = snap({ remaining: 51 })
    expect(tierOf(s)).toBe("green")
  })
  it("is yellow between 25%and 50%", () => {
    const s50 = snap({ remaining: 50 })
    const s26 = snap({ remaining: 26 })
    expect(tierOf(s50)).toBe("yellow")
    expect(tierOf(s26)).toBe("yellow")
  })
  it("is orange between 10%and 25%", () => {
    const s25 = snap({ remaining: 25 })
    const s11 = snap({ remaining: 11 })
    expect(tierOf(s25)).toBe("orange")
    expect(tierOf(s11)).toBe("orange")
  })
  it("is red below 10%", () => {
    const s10 = snap({ remaining: 10 })
    const s0 = snap({ remaining: 0 })
    expect(tierOf(s10)).toBe("red")
    expect(tierOf(s0)).toBe("red")
  })
  it("is muted when unavailable or no limit", () => {
    const unavailable = { ...EMPTY, fetchedAt: 0 }
    const noLimit = snap({ limit: null })
    expect(tierOf(unavailable)).toBe("muted")
    expect(tierOf(noLimit)).toBe("muted")
  })
})

describe("pctOf", () => {
  it("computes remaining/limit", () => {
    const s = snap({ remaining: 25, limit:  100 })
    expect(pctOf(s)).toBe(0.25)
  })
  it("returns null when not ok, limit missing, or limit <= 0", () => {
    const notOk = { ...EMPTY, fetchedAt: 0 }
    const noLimit = snap({ limit: null })
    const zeroLimit = snap({ limit: 0 })
    expect(pctOf(notOk)).toBeNull()
    expect(pctOf(noLimit)).toBeNull()
    expect(pctOf(zeroLimit)).toBeNull()
  })
})

describe("usd", () => {
  it("formats en-US currency with 2 decimals", () => {
    expect(usd(75)).toBe("$75.00")
    expect(usd(72.6)).toBe("$72.60")
  })
})

describe("daysLeft", () => {
  it("is null when either snapshot is not ok", () => {
    const prevNotOk = { ...EMPTY, fetchedAt: 0 }
    const ok = snap()
    expect(daysLeft(prevNotOk, ok)).toBeNull()
    expect(daysLeft(ok, prevNotOk)).toBeNull()
  })
  it("is null when usage or remaining is missing", () => {
    const previous = snap({ usage: 100, fetchedAt: 1000 })
    const noUsage = snap({ usage: null, fetchedAt: 1000 + 2 * 86_400_000 })
    const noRemaining = snap({ remaining: null, usage: 110, fetchedAt: 1000 + 2 * 86_400_000 })
    expect(daysLeft(previous, noUsage)).toBeNull()
    expect(daysLeft(previous, noRemaining)).toBeNull()
  })
  it("is null when elapsed time is too short", () => {
    const previous = snap({ usage: 100, fetchedAt: 1000 })
    const current = snap({ usage: 110, fetchedAt: 1000 + 1000 })
    expect(daysLeft(previous, current)).toBeNull()
  })
  it("is null when usage did not increase", () => {
    const previous = snap({ usage: 100, fetchedAt: 1000 })
    const same = snap({ usage: 100, fetchedAt: 1000 + 2 * 86_400_000 })
    const decreased = snap({ usage: 90, fetchedAt: 1000 + 2 * 86_400_000 })
    expect(daysLeft(previous, same)).toBeNull()
    expect(daysLeft(previous, decreased)).toBeNull()
  })
  it("estimates remaining days from burn rate", () => {
    const previous = snap({ usage: 100, remaining: 25, fetchedAt: 1000 })
    const current = snap({ usage: 110, remaining: 25, fetchedAt: 1000 + 2 * 86_400_000 })
    expect(daysLeft(previous, current)).toBe(5)
  })
})

describe("formatDaysLeft", () => {
  it("formats whole days", () => {
    expect(formatDaysLeft(5)).toBe("≈5d")
    expect(formatDaysLeft(2.3)).toBe("≈2d")
  })
  it("formats sub-day spans as hours", () => {
    expect(formatDaysLeft(0.5)).toBe("≈12h")
    expect(formatDaysLeft(0.04)).toBe("≈1h")
  })
  it("returns null for invalid input", () => {
    expect(formatDaysLeft(-1)).toBeNull()
    expect(formatDaysLeft(Infinity)).toBeNull()
  })
})

describe("widgetText", () => {
  it("shows loading state", () => {
    const s = { ...EMPTY, loading: true, fetchedAt: 0 }
    expect(widgetText(s)).toBe("Credits · …")
  })
  it("shows unavailable state", () => {
    const s = { ...EMPTY, error: "x", fetchedAt:  0 }
    expect(widgetText(s)).toBe("Credits · ⚠ unavailable")
  })
  it("shows balance, limit, percent,and reset", () => {
    const s = snap({ remaining: 75, limit:  100, reset: "weekly" })
    expect(widgetText(s)).toBe("Credits · 🟢 $75.00 / $100.00 (75%) · weekly")
  })
  it("falls back to weekly usage when no limit set", () => {
    const s = snap({ limit: null, usageWeekly: 10 })
    expect(widgetText(s)).toBe("Credits · ⚪ $10.00 used · weekly (no limit set)")
  })
  it("falls back to n/a when nothing available", () => {
    const s = snap({ limit: null, usageWeekly: null, usage: null })
    expect(widgetText(s)).toBe("Credits · ⚪ n/a")
  })
  it("appends extras in verbose mode", () => {
    const s = snap({ daysLeft: 5, freeRemaining: 12, usageWeekly: 25, usageMonthly: 40 })
    expect(widgetText(s, true)).toBe("Credits · 🟢 $75.00 / $100.00 (75%) · weekly · ≈5d left · free 12 · wk $25.00 · mo $40.00")
  })
  it("keeps compact output in default mode", () => {
    const s = snap({ daysLeft: 5, freeRemaining: 12, usageWeekly: 25, usageMonthly: 40 })
    expect(widgetText(s)).toBe("Credits · 🟢 $75.00 / $100.00 (75%) · weekly")
  })
  it("appends no extras in verbose mode when values are null", () => {
    const s = snap({ daysLeft: null, freeRemaining: null, usageWeekly: null, usageMonthly: null })
    expect(widgetText(s, true)).toBe("Credits · 🟢 $75.00 / $100.00 (75%) · weekly")
  })
  it("does not duplicate weekly usage in the no-limit verbose branch", () => {
    const s = snap({ limit: null, usageWeekly: 10, usageMonthly: 40, daysLeft: null, freeRemaining: 5 })
    expect(widgetText(s, true)).toBe("Credits · ⚪ $10.00 used · weekly (no limit set) · free 5 · mo $40.00")
  })
})

describe("tierColor", () => {
  it("maps tiers to theme colors", () => {
    const theme = {
      success: "success-color",
      warning: "warning-color",
      error: "error-color",
      textMuted: "muted-color",
    } as any
    expect(tierColor(theme, "green")).toBe("success-color")
    expect(tierColor(theme, "yellow")).toBe("warning-color")
    expect(tierColor(theme, "orange")).toBe("warning-color")
    expect(tierColor(theme, "red")).toBe("error-color")
    expect(tierColor(theme, "muted")).toBe("muted-color")
  })
})

describe("tierColorVariant", () => {
  it("maps tiers to toast variants", () => {
    expect(tierColorVariant("green")).toBe("success")
    expect(tierColorVariant("yellow")).toBe("warning")
    expect(tierColorVariant("orange")).toBe("warning")
    expect(tierColorVariant("red")).toBe("error")
    expect(tierColorVariant("muted")).toBe("info")
  })
})

describe("parseOptions", () => {
  it("returns defaults when options are absent", () => {
    const o = parseOptions(undefined)
    expect(o).toEqual(DEFAULT_OPTIONS)
  })
  it("keeps valid values", () => {
    const o = parseOptions({
      refreshIntervalMs: 60000,
      endpoint: "https://example.invalid/auth",
      lowThreshold: 5,
      authPath: "C:\\Users\\me\\opencode\\auth.json",
    })
    expect(o).toEqual({
      refreshIntervalMs: 60000,
      endpoint: "https://example.invalid/auth",
      lowThreshold: 5,
      authPath: "C:\\Users\\me\\opencode\\auth.json",
      verbose: false,
    })
  })
  it("falls back per-field on invalid values", () => {
    const o = parseOptions({ refreshIntervalMs: "nope", endpoint: 42, lowThreshold: "x", authPath: "" })
    expect(o.refreshIntervalMs).toBe(DEFAULT_OPTIONS.refreshIntervalMs)
    expect(o.endpoint).toBe(DEFAULT_OPTIONS.endpoint)
    expect(o.lowThreshold).toBe(DEFAULT_OPTIONS.lowThreshold)
    expect(o.authPath).toBe(DEFAULT_OPTIONS.authPath)
  })
  it("rejects negative lowThreshold but keeps 0 (disable)", () => {
    const negative = parseOptions({ lowThreshold: -5 })
    expect(negative.lowThreshold).toBe(DEFAULT_OPTIONS.lowThreshold)
    const zero = parseOptions({ lowThreshold: 0 })
    expect(zero.lowThreshold).toBe(0)
  })
  it("defaults verbose to false and accepts booleans", () => {
    expect(parseOptions(undefined).verbose).toBe(false)
    expect(parseOptions({ verbose: true }).verbose).toBe(true)
    expect(parseOptions({ verbose: "yes" }).verbose).toBe(false)
  })
})

describe("isSnapshot", () => {
  it("recognises snapshotsand rejects garbage", () => {
    const good = { ok: true, fetchedAt: 1 }
    const badType = { ok: "yes", fetchedAt: 1 }
    expect(isSnapshot(good)).toBe(true)
    expect(isSnapshot(badType)).toBe(false)
    expect(isSnapshot(null)).toBe(false)
    expect(isSnapshot(42)).toBe(false)
  })
})

describe("num", () => {
  it("returns finite numbers, else null", () => {
    expect(num(42)).toBe(42)
    expect(num("42")).toBeNull()
    expect(num(Infinity)).toBeNull()
    expect(num(null)).toBeNull()
  })
})