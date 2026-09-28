import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { RGBA } from "@opentui/core"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"

export type Tier = "green" | "yellow" | "orange" | "red" | "muted"
export type ToastVariant = "success" | "warning" | "error" | "info"

export type Snapshot = {
  ok: boolean
  loading?: boolean
  remaining: number | null
  limit: number | null
  reset: string | null
  usageWeekly: number | null
  usageMonthly: number | null
  usage: number | null
  freeRemaining: number | null
  daysLeft: number | null
  error?: string
  fetchedAt: number
}

export type Options = {
  refreshIntervalMs: number
  endpoint: string
  lowThreshold: number
  authPath: string
  verbose: boolean
}

export const EMOJI: Record<Tier, string> = {
  green: "🟢",
  yellow: "🟡",
  orange: "🟠",
  red: "🔴",
  muted: "⚪",
}

export const EMPTY: Snapshot = {
  ok: false,
  remaining: null,
  limit: null,
  reset: null,
  usageWeekly: null,
  usageMonthly: null,
  usage: null,
  freeRemaining: null,
  daysLeft: null,
  fetchedAt: 0,
}

export const DEFAULT_OPTIONS: Options = {
  refreshIntervalMs: 15 * 60 * 1000,
  endpoint: "https://openrouter.ai/api/v1/auth/key",
  lowThreshold: 10,
  authPath: join(homedir(), ".local", "share", "opencode", "auth.json"),
  verbose: false,
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.ok === "boolean" && typeof v.fetchedAt === "number"
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readOpenRouterKey(authPath: string): string | null {
  try {
    const raw = readFileSync(authPath, "utf8")
    const json = JSON.parse(raw) as { openrouter?: { type?: string; key?: string } }
    const key = json?.openrouter?.key
    return typeof key === "string" && key.length > 0 ? key : null
  } catch {
    return null
  }
}

function unavailable(reason: string): Snapshot {
  return { ...EMPTY, error: reason }
}

export async function fetchSnapshot(endpoint: string, authPath: string): Promise<Snapshot> {
  const key = readOpenRouterKey(authPath)
  if (!key) {
    return unavailable("no OpenRouter key in auth.json")
  }
  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    })
    if (!res.ok) {
      return unavailable(`OpenRouter API ${res.status}`)
    }
    const json = (await res.json()) as {
      data?: {
        limit?: unknown
        limit_remaining?: unknown
        limit_reset?: unknown
        usage_weekly?: unknown
        usage_monthly?: unknown
        usage?: unknown
        free_model_daily_requests?: { remaining?: unknown }
      }
    }
    const d = json?.data ?? {}
    return {
      ok: true,
      remaining: num(d.limit_remaining),
      limit: num(d.limit),
      reset: typeof d.limit_reset === "string" ? d.limit_reset : null,
      usageWeekly: num(d.usage_weekly),
      usageMonthly: num(d.usage_monthly),
      usage: num(d.usage),
      freeRemaining: num(d.free_model_daily_requests?.remaining),
      daysLeft: null,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err))
  }
}

export function pctOf(snapshot: Snapshot): number | null {
  if (!snapshot.ok || snapshot.limit === null || snapshot.remaining === null || snapshot.limit <= 0) {
    return null
  }
  return snapshot.remaining / snapshot.limit
}

export function tierOf(snapshot: Snapshot): Tier {
  const pct = pctOf(snapshot)
  if (pct === null) return "muted"
  if (pct > 0.5) return "green"
  if (pct > 0.25) return "yellow"
  if (pct > 0.1) return "orange"
  return "red"
}

export function usd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const MIN_ELAPSED_MS = 60_000

export function daysLeft(previous: Snapshot, current: Snapshot): number | null {
  if (!previous.ok || !current.ok) return null
  if (previous.usage === null || current.usage === null) return null
  if (current.remaining === null) return null
  const elapsedMs = current.fetchedAt - previous.fetchedAt
  if (elapsedMs < MIN_ELAPSED_MS) return null
  const delta = current.usage - previous.usage
  if (delta <= 0) return null
  const dailyBurn = delta / (elapsedMs / 86_400_000)
  if (dailyBurn <= 0) return null
  const days = current.remaining / dailyBurn
  return Number.isFinite(days) && days >= 0 ? days : null
}

export function formatDaysLeft(days: number): string | null {
  if (!Number.isFinite(days) || days < 0) return null
  if (days < 1) return `≈${Math.max(1, Math.round(days * 24))}h`
  return `≈${Math.round(days)}d`
}

export function widgetText(snapshot: Snapshot, verbose = false): string {
  if (snapshot.loading) return "Credits · …"
  if (!snapshot.ok) return "Credits · ⚠ unavailable"
  const { limit, remaining, reset } = snapshot
  let text: string
  let weeklyShown = false
  if (limit !== null && remaining !== null) {
    const pct = Math.round((remaining / limit) * 100)
    text = `Credits · ${EMOJI[tierOf(snapshot)]} ${usd(remaining)} / ${usd(limit)} (${pct}%)${reset ? ` · ${reset}` : ""}`
  } else if (snapshot.usageWeekly !== null) {
    text = `Credits · ${EMOJI.muted} ${usd(snapshot.usageWeekly)} used · weekly (no limit set)`
    weeklyShown = true
  } else {
    text = `Credits · ${EMOJI.muted} n/a`
  }
  if (verbose) {
    const extras: string[] = []
    if (snapshot.daysLeft !== null) {
      const f = formatDaysLeft(snapshot.daysLeft)
      if (f) extras.push(`${f} left`)
    }
    if (snapshot.freeRemaining !== null) extras.push(`free ${snapshot.freeRemaining}`)
    if (snapshot.usageWeekly !== null && !weeklyShown) extras.push(`wk ${usd(snapshot.usageWeekly)}`)
    if (snapshot.usageMonthly !== null) extras.push(`mo ${usd(snapshot.usageMonthly)}`)
    if (extras.length > 0) text += ` · ${extras.join(" · ")}`
  }
  return text
}

export function tierColorVariant(tier: Tier): ToastVariant {
  switch (tier) {
    case "green":
      return "success"
    case "yellow":
    case "orange":
      return "warning"
    case "red":
      return "error"
    default:
      return "info"
  }
}

export function tierColor(theme: TuiThemeCurrent, tier: Tier): RGBA {
  switch (tier) {
    case "green":
      return theme.success
    case "yellow":
    case "orange":
      return theme.warning
    case "red":
      return theme.error
    default:
      return theme.textMuted
  }
}

export function parseOptions(raw: unknown): Options {
  const opts = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    refreshIntervalMs:
      typeof opts.refreshIntervalMs === "number" && Number.isFinite(opts.refreshIntervalMs) && opts.refreshIntervalMs > 0
        ? opts.refreshIntervalMs
        : DEFAULT_OPTIONS.refreshIntervalMs,
    endpoint:
      typeof opts.endpoint === "string" && opts.endpoint.length > 0 ? opts.endpoint : DEFAULT_OPTIONS.endpoint,
    lowThreshold:
      typeof opts.lowThreshold === "number" && Number.isFinite(opts.lowThreshold) && opts.lowThreshold >= 0
        ? opts.lowThreshold
        : DEFAULT_OPTIONS.lowThreshold,
    authPath:
      typeof opts.authPath === "string" && opts.authPath.length > 0 ? opts.authPath : DEFAULT_OPTIONS.authPath,
    verbose: typeof opts.verbose === "boolean" ? opts.verbose : DEFAULT_OPTIONS.verbose,
  }
}