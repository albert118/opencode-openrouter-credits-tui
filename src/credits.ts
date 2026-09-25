import { homedir } from "node:os"
import { join } from "node:path"

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
  error?: string
  fetchedAt: number
}

export type Options = {
  refreshIntervalMs: number
  endpoint: string
  lowThreshold: number
  authPath: string
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
  fetchedAt: 0,
}

export const DEFAULT_OPTIONS: Options = {
  refreshIntervalMs: 15 * 60 * 1000,
  endpoint: "https://openrouter.ai/api/v1/auth/key",
  lowThreshold: 10,
  authPath: join(homedir(), ".local", "share", "opencode", "auth.json"),
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.ok === "boolean" && typeof v.fetchedAt === "number"
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
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

export function widgetText(snapshot: Snapshot): string {
  if (snapshot.loading) return "Credits · …"
  if (!snapshot.ok) return "Credits · ⚠ unavailable"
  const { limit, remaining, reset } = snapshot
  if (limit !== null && remaining !== null) {
    const pct = Math.round((remaining / limit) * 100)
    return `Credits · ${EMOJI[tierOf(snapshot)]} ${usd(remaining)} / ${usd(limit)} (${pct}%)${reset ? ` · ${reset}` : ""}`
  }
  if (snapshot.usageWeekly !== null) {
    return `Credits · ${EMOJI.muted} ${usd(snapshot.usageWeekly)} used · weekly (no limit set)`
  }
  return `Credits · ${EMOJI.muted} n/a`
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
      typeof opts.lowThreshold === "number" && Number.isFinite(opts.lowThreshold) ? opts.lowThreshold : DEFAULT_OPTIONS.lowThreshold,
    authPath:
      typeof opts.authPath === "string" && opts.authPath.length > 0 ? opts.authPath : DEFAULT_OPTIONS.authPath,
  }
}