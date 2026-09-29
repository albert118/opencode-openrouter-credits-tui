import { describe, expect, it } from "bun:test"
import { DEFAULT_OPTIONS, type Options } from "../core"
import { fetch, monthStartIso, parse, parseWeaveRows } from "./weave"

function opts(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    provider: "weave",
    apiKey: "ra_123",
    baseUrl: "https://router.workweave.ai",
    ...overrides,
  }
}

describe("monthStartIso", () => {
  it("returns the ISO start of the current month in UTC", () => {
    expect(monthStartIso(new Date("2026-09-28T12:00:00Z"))).toBe("2026-09-01T00:00:00.000Z")
    expect(monthStartIso(new Date("2026-01-15T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z")
    expect(monthStartIso(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01T00:00:00.000Z")
  })
})

describe("parseWeaveRows", () => {
  it("aggregates input+output cost and counts rows", () => {
    const text = [
      JSON.stringify({ actual_input_cost_usd: 0.1, actual_output_cost_usd: 0.2 }),
      JSON.stringify({ actual_input_cost_usd: 1.5, actual_output_cost_usd: 0.5 }),
      JSON.stringify({ actual_input_cost_usd: 0, actual_output_cost_usd: 0 }),
    ].join("\n")
    expect(parseWeaveRows(text)).toEqual({ spentUsd: 2.3, requestCount: 3 })
  })
  it("treats missing or non-numeric cost as 0", () => {
    const text = [
      JSON.stringify({ actual_input_cost_usd: "nope", actual_output_cost_usd: 0.5 }),
      JSON.stringify({ actual_input_cost_usd: null, actual_output_cost_usd: undefined }),
      JSON.stringify({}),
    ].join("\n")
    expect(parseWeaveRows(text)).toEqual({ spentUsd: 0.5, requestCount: 3 })
  })
  it("returns 0/0 for empty or blank body", () => {
    expect(parseWeaveRows("")).toEqual({ spentUsd: 0, requestCount: 0 })
    expect(parseWeaveRows("\n\n  \n")).toEqual({ spentUsd: 0, requestCount: 0 })
  })
})

describe("parse", () => {
  it("builds a spend snapshot from NDJSON text", () => {
    const text = [JSON.stringify({ actual_input_cost_usd: 1, actual_output_cost_usd: 2 })].join("\n")
    const s = parse(text)
    expect(s.ok).toBe(true)
    expect(s.mode).toBe("spend")
    expect(s.spentUsd).toBe(3)
    expect(s.requestCount).toBe(1)
    expect(typeof s.since).toBe("string")
    expect(s.remaining).toBeNull()
    expect(s.limit).toBeNull()
  })
  it("passes through an unavailable snapshot", () => {
    const s = parse({ ok: false, fetchedAt: 0, error: "Weave API 500" })
    expect(s.ok).toBe(false)
    expect(s.error).toBe("Weave API 500")
  })
})

describe("fetch (mocked)", () => {
  it("paginates and concatenates page bodies", async () => {
    const calls: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (input: unknown) => {
      const url = new URL(String(input))
      calls.push(url.toString())
      if (url.searchParams.get("cursor") === "abc") {
        return new Response("row3", { headers: {} })
      }
      return new Response("row1\nrow2", {
        headers: { "x-weave-has-more": "true", "x-weave-next-cursor": "abc" },
      })
    }
    try {
      const raw = await fetch(opts())
      expect(raw).toBe("row1\nrow2row3")
      expect(calls.length).toBe(2)
      expect(calls[0]).toContain("since=")
      expect(calls[0]).toContain("limit=1000")
      expect(calls[1]).toContain("cursor=abc")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("returns unavailable on persistent 429", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response("", { status: 429, headers: { "retry-after": "0.1" } })
    try {
      const raw = await fetch(opts())
      expect(raw).toMatchObject({ ok: false, error: "Weave API rate limited (429)" })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("returns unavailable on a non-200 status", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("", { status: 500 })
    try {
      const raw = await fetch(opts())
      expect(raw).toMatchObject({ ok: false, error: "Weave API 500" })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("returns unavailable when no apiKey is configured", async () => {
    const raw = await fetch(opts({ apiKey: "" }))
    expect(raw).toMatchObject({ ok: false, error: "no Weave apiKey configured" })
  })
})