import { isSnapshot, num, unavailable, type Options, type Snapshot } from "../core"
import type { Provider } from "./types"

const MAX_PAGES = 20
const PAGE_LIMIT = 1000
const RETRY_DELAY_MS = 1000

export function monthStartIso(now = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01T00:00:00.000Z`
}

export function parseWeaveRows(text: string): { spentUsd: number; requestCount: number } {
  let spentUsd = 0
  let requestCount = 0
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    let row: Record<string, unknown>
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }
    const input = num(row.actual_input_cost_usd) ?? 0
    const output = num(row.actual_output_cost_usd) ?? 0
    spentUsd += input + output
    requestCount += 1
  }
  return { spentUsd, requestCount }
}

export function resolveKey(opts: Options): string | null {
  return opts.apiKey.length > 0 ? opts.apiKey : null
}

export async function fetch(opts: Options): Promise<unknown> {
  const key = resolveKey(opts)
  if (!key) {
    return unavailable("no Weave apiKey configured")
  }
  const base = `${opts.baseUrl.replace(/\/+$/, "")}/v1/analytics/routing-decisions`
  const since = monthStartIso()
  let cursor: string | null = null
  let body = ""
  let pages = 0
  let retried = false
  try {
    while (pages < MAX_PAGES) {
      const url = new URL(base)
      url.searchParams.set("since", since)
      url.searchParams.set("limit", String(PAGE_LIMIT))
      if (cursor) url.searchParams.set("cursor", cursor)
      const res = await globalThis.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.status === 429) {
        if (!retried) {
          retried = true
          const retryAfter = Number(res.headers.get("retry-after"))
          const delay =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY_MS
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
        return unavailable("Weave API rate limited (429)")
      }
      if (!res.ok) {
        return unavailable(`Weave API ${res.status}`)
      }
      body += await res.text()
      pages += 1
      if (res.headers.get("x-weave-has-more")?.toLowerCase() === "true") {
        const next = res.headers.get("x-weave-next-cursor")
        if (next) {
          cursor = next
          continue
        }
      }
      break
    }
    return body
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err))
  }
}

export function parse(raw: unknown): Snapshot {
  if (isSnapshot(raw)) return raw
  const text = typeof raw === "string" ? raw : ""
  const { spentUsd, requestCount } = parseWeaveRows(text)
  return {
    ok: true,
    mode: "spend",
    remaining: null,
    limit: null,
    reset: null,
    usageWeekly: null,
    usageMonthly: null,
    usage: null,
    freeRemaining: null,
    daysLeft: null,
    spentUsd,
    requestCount,
    since: monthStartIso(),
    fetchedAt: Date.now(),
  }
}

export const weaveProvider: Provider = {
  id: "weave",
  resolveKey,
  fetch,
  parse,
}