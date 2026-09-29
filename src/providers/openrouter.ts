import { readFileSync } from "node:fs"
import { isSnapshot, num, unavailable, type Options, type Snapshot } from "../core"
import type { Provider } from "./types"

export function readOpenRouterKey(authPath: string): string | null {
  try {
    const raw = readFileSync(authPath, "utf8")
    const json = JSON.parse(raw) as { openrouter?: { type?: string; key?: string } }
    const key = json?.openrouter?.key
    return typeof key === "string" && key.length > 0 ? key : null
  } catch {
    return null
  }
}

export function resolveKey(opts: Options): string | null {
  return readOpenRouterKey(opts.authPath)
}

export async function fetch(opts: Options): Promise<unknown> {
  const key = resolveKey(opts)
  if (!key) {
    return unavailable("no OpenRouter key in auth.json")
  }
  try {
    const res = await globalThis.fetch(opts.endpoint, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    })
    if (!res.ok) {
      return unavailable(`OpenRouter API ${res.status}`)
    }
    return res.json()
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err))
  }
}

export function parse(raw: unknown): Snapshot {
  if (isSnapshot(raw)) return raw
  const json = raw as {
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
    mode: "balance",
    remaining: num(d.limit_remaining),
    limit: num(d.limit),
    reset: typeof d.limit_reset === "string" ? d.limit_reset : null,
    usageWeekly: num(d.usage_weekly),
    usageMonthly: num(d.usage_monthly),
    usage: num(d.usage),
    freeRemaining: num(d.free_model_daily_requests?.remaining),
    daysLeft: null,
    spentUsd: null,
    requestCount: null,
    since: null,
    fetchedAt: Date.now(),
  }
}

export const openrouterProvider: Provider = {
  id: "openrouter",
  resolveKey,
  fetch,
  parse,
}