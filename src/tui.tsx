/**
 * OpenRouter/Weave usage widget for the opencode v2 TUI.
 *
 * Port of the v1 plugin onto the v2 `@opencode/plugin/tui` SDK: a durable
 * snapshot store (seeded from the previous run, cleared of the stale
 * two-sample burn estimate) paints instantly before the first network
 * round-trip, then refreshes on `refreshIntervalMs`. Failures degrade to a
 * muted state instead of crashing the plugin.
 *
 * JSX authoring uses `@jsxImportSource @opentui/solid` so the JSX runtime is
 * resolved from opencode's Solid interop package (single Solid instance).
 */

/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import type { ResolvedTheme } from "@opencode/theme/tui"
import type { RGBA } from "@opentui/core"
import {
  buildStatusLine,
  daysLeft,
  fetchSnapshot,
  initialSnapshot,
  parseOptions,
  slotSpec,
  spendPerDay,
  tierColorVariant,
  tierOf,
  tierThemeToken,
  widgetText,
  type Options,
  type Snapshot,
} from "./core"

const STORE_KEY = "usage-tui:snapshot"
const TOAST_TITLE = "OpenRouter credits"
const TOAST_DURATION_MS = 4000

function themeToken(theme: ResolvedTheme, path: string): RGBA | undefined {
  let value: unknown = theme
  for (const part of path.split(".")) {
    value = (value as Record<string, unknown> | undefined)?.[part]
    if (value === undefined) return undefined
  }
  return value as RGBA
}

export default Plugin.define({
  id: "usage",
  setup(context) {
    const opts: Options = parseOptions(context.options)
    const [snapshot, updateSnapshot] = context.storage.store<Snapshot>(STORE_KEY, {
      initial: initialSnapshot(undefined),
    })
    if (snapshot.daysLeft !== null) {
      void updateSnapshot((draft) => {
        Object.assign(draft, initialSnapshot(draft))
      })
    }

    let burn: number | null = null
    let firstFetch = true
    let lowNotified = false
    const controller = new AbortController()

    context.ui.slot({
      append: slotSpec.name,
      render: () => {
        const s = snapshot
        const theme = context.theme
        return (
          <box
            alignSelf="flex-start"
            flexGrow={0}
            backgroundColor={theme.background.raised.base}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={themeToken(theme, tierThemeToken(tierOf(s))) ?? theme.text.base}>
              {buildStatusLine(s, opts, burn)}
            </text>
          </box>
        )
      },
    })

    const tick = async () => {
      const fresh = await fetchSnapshot(opts)
      if (controller.signal.aborted) return
      const previous = snapshot
      const withDays = { ...fresh, daysLeft: daysLeft(previous, fresh) }
      burn = fresh.mode === "spend" ? spendPerDay(previous, fresh) : null
      if (fresh.ok) {
        void updateSnapshot((draft) => {
          Object.assign(draft, withDays)
        })
      }
      if (fresh.mode === "balance" && fresh.ok && fresh.remaining !== null && fresh.remaining < opts.lowThreshold) {
        if (!lowNotified) {
          lowNotified = true
          void context.attention.notify({
            title: "OpenRouter credits low",
            message: widgetText(fresh, opts.verbose),
            notification: true,
          })
        }
      } else {
        lowNotified = false
      }
      const tier = tierOf(fresh)
      if (firstFetch || tier !== tierOf(previous)) {
        context.ui.toast.show({
          variant: tier === "muted" ? "warning" : tierColorVariant(tier),
          title: TOAST_TITLE,
          message: widgetText(fresh, opts.verbose),
          duration: TOAST_DURATION_MS,
        })
      }
      firstFetch = false
    }

    void tick()
    const interval = setInterval(() => void tick(), opts.refreshIntervalMs)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  },
})