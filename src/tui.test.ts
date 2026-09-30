import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EMPTY, isSnapshot, type Snapshot } from "./core"
import plugin from "./tui"

const originalFetch = globalThis.fetch

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type SlotClaim = { render: unknown } & Record<string, unknown>

function createFakeContext(overrides: { options?: Record<string, unknown>; persisted?: Record<string, unknown> } = {}) {
  const { options = {}, persisted = {} } = overrides
  const registrations: { key: string; initial: unknown }[] = []
  const stores = new Map<string, { value: unknown; writes: unknown[] }>()
  const slots: SlotClaim[] = []
  const toasts: unknown[] = []
  const notifies: unknown[] = []
  const context = {
    options,
    storage: {
      store(key: string, { initial }: { initial: Snapshot }) {
        registrations.push({ key, initial })
        const entry = { value: persisted[key] ? { ...(persisted[key] as object) } : { ...initial }, writes: [] as unknown[] }
        stores.set(key, entry)
        return [
          entry.value,
          (mutation: (draft: object) => void) => {
            mutation(entry.value)
            entry.writes.push(structuredClone(entry.value))
            return Promise.resolve()
          },
        ] as const
      },
      memory() {
        throw new Error("memory() is not used by the plugin")
      },
    },
    ui: {
      slot(claim: SlotClaim) {
        slots.push(claim)
        return () => {}
      },
      toast: {
        show(toast: unknown) {
          toasts.push(toast)
        },
      },
    },
    attention: {
      notify(notification: unknown) {
        notifies.push(notification)
        return Promise.resolve({ ok: true, notification: true, sound: true })
      },
    },
    theme: { text: { base: [1], muted: [2] }, background: { raised: { base: [3] } } },
  }
  return { context, registrations, stores, slots, toasts, notifies }
}

function writeTempAuth(key: string): string {
  const dir = mkdtempSync(join(tmpdir(), "usage-tui-"))
  writeFileSync(join(dir, "auth.json"), JSON.stringify({ openrouter: { type: "api", key } }))
  return join(dir, "auth.json")
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("usage plugin (fake context)", () => {
  it("registers the home.footer.status slot with append placement", () => {
    const fake = createFakeContext()
    const cleanup = plugin.setup(fake.context as any)
    expect(fake.slots).toHaveLength(1)
    expect(fake.slots[0].append).toBe("home.footer.status")
    expect(fake.slots[0].prepend).toBeUndefined()
    expect(fake.slots[0].replace).toBeUndefined()
    expect(typeof fake.slots[0].render).toBe("function")
    cleanup()
  })

  it("seeds the durable store from its initial loading state", () => {
    const fake = createFakeContext()
    const cleanup = plugin.setup(fake.context as any)
    expect(fake.registrations).toHaveLength(1)
    expect(fake.registrations[0].key).toBe("usage-tui:snapshot")
    expect(fake.registrations[0].initial).toEqual({ ...EMPTY, loading: true, error: "loading" })
    expect(fake.stores.get("usage-tui:snapshot")?.value).toEqual({ ...EMPTY, loading: true, error: "loading" })
    cleanup()
  })

  it("clears a stored snapshot's stale daysLeft at seed", () => {
    const stored: Snapshot = {
      ...EMPTY,
      ok: true,
      mode: "balance",
      remaining: 75,
      limit: 100,
      reset: "weekly",
      usage: 100,
      daysLeft: 5,
      fetchedAt: 1,
    }
    const fake = createFakeContext({ persisted: { "usage-tui:snapshot": stored } })
    const cleanup = plugin.setup(fake.context as any)
    const value = fake.stores.get("usage-tui:snapshot")?.value as Snapshot
    expect(isSnapshot(value)).toBe(true)
    expect(value.daysLeft).toBeNull()
    expect(value.remaining).toBe(75)
    cleanup()
  })

  it("writes back a fresh snapshot after a successful poll", async () => {
    const authPath = writeTempAuth("sk-test")
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { limit: 100, limit_remaining: 80, limit_reset: "weekly", usage_weekly: 10, usage_monthly: 20 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    const fake = createFakeContext({ options: { authPath, refreshIntervalMs: 60_000 } })
    const cleanup = plugin.setup(fake.context as any)
    try {
      await sleep(20)
      const value = fake.stores.get("usage-tui:snapshot")?.value as Snapshot
      expect(value.ok).toBe(true)
      expect(value.mode).toBe("balance")
      expect(value.remaining).toBe(80)
      expect(value.limit).toBe(100)
      expect(fake.stores.get("usage-tui:snapshot")?.writes.length).toBeGreaterThan(0)
      expect(fake.toasts.length).toBe(1)
    } finally {
      cleanup()
      rmSync(join(authPath, ".."), { recursive: true, force: true })
    }
  })

  it("returns a cleanup that aborts the controller and clears the interval", () => {
    const originalClear = globalThis.clearInterval
    const originalAbortController = globalThis.AbortController
    const cleared: unknown[] = []
    let aborted = 0
    globalThis.clearInterval = ((id: unknown) => {
      cleared.push(id)
      return originalClear(id)
    }) as typeof clearInterval
    globalThis.AbortController = class extends AbortController {
      constructor() {
        super()
      }
      override abort(): void {
        aborted += 1
        super.abort()
      }
    } as unknown as typeof AbortController
    const fake = createFakeContext()
    try {
      const cleanup = plugin.setup(fake.context as any)
      expect(aborted).toBe(0)
      cleanup()
      expect(aborted).toBe(1)
      expect(cleared).toHaveLength(1)
    } finally {
      globalThis.clearInterval = originalClear
      globalThis.AbortController = originalAbortController
    }
  })

  it("notifies low credit exactly once while below the threshold", async () => {
    const authPath = writeTempAuth("sk-test")
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { limit: 100, limit_remaining: 10, limit_reset: "weekly", usage_weekly: 0, usage_monthly: 0 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    const fake = createFakeContext({ options: { authPath, lowThreshold: 11, refreshIntervalMs: 10 } })
    const cleanup = plugin.setup(fake.context as any)
    try {
      await sleep(50)
      expect(fake.notifies).toHaveLength(1)
      expect(fake.notifies[0]).toMatchObject({ title: "OpenRouter credits low" })
    } finally {
      cleanup()
      rmSync(join(authPath, ".."), { recursive: true, force: true })
    }
  })

  it("never notifies in spend mode", async () => {
    globalThis.fetch = async () =>
      new Response(
        [JSON.stringify({ actual_input_cost_usd: 1, actual_output_cost_usd: 2 })].join("\n"),
        { status: 200 },
      )
    const fake = createFakeContext({
      options: { provider: "weave", apiKey: "ra_test", baseUrl: "https://router.workweave.ai", refreshIntervalMs: 10 },
    })
    const cleanup = plugin.setup(fake.context as any)
    try {
      await sleep(50)
      expect(fake.notifies).toHaveLength(0)
      const value = fake.stores.get("usage-tui:snapshot")?.value as Snapshot
      expect(value.ok).toBe(true)
      expect(value.mode).toBe("spend")
    } finally {
      cleanup()
    }
  })
})