/**
 * OpenRouter credits widget for the opencode TUI.
 *
 * Rendersa persistent, always-visible credits line into the `app_bottom`
 * slot (fixed bottom strip rendered on every route; unlike `sidebar_footer` /
 * `home_footer` it is append-mode, so it does not displace the internal
 * footers that show the working directory).
 *
 * Refresh: every 15 minutes(configurable). Seed: `api.kv` snapshot so
 * the widget paints instantly before the first network round-trip. Failures
 * degrade to a muted state instead of crashing the plugin.
 *
 * JSX authoring uses `@jsxImportSource @opentui/solid` so the JSX runtime is
 * resolved from opencode's Solid interop package (single Solid instance).
 */

/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid"
import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
import {
  EMPTY,
  fetchSnapshot,
  isSnapshot,
  parseOptions,
  tierColor,
  tierColorVariant,
  tierOf,
  widgetText,
  type Options,
  type Snapshot,
} from "./core"

const KV_KEY = "openrouter-credits:snapshot"

const plugin: TuiPluginModule = {
  id: "openrouter-credits",
  tui: async (api, options) => {
    const opts: Options = parseOptions(options)
    const cached = api.kv.get(KV_KEY)
    const initial: Snapshot = isSnapshot(cached) ? cached : { ...EMPTY, loading: true, error: "loading" }
    const [state, setState] = createSignal<Snapshot>(initial)
    const { signal } = api.lifecycle

    api.slots.register({
      slots: {
        app_bottom: (ctx): JSX.Element => {
          const snapshot = state()
          const theme = ctx.theme.current
          return (
            <box
              border
              borderColor={theme.border}
              backgroundColor={theme.backgroundPanel}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
            >
              <text fg={tierColor(theme, tierOf(snapshot))}>{widgetText(snapshot)}</text>
            </box>
          )
        },
      },
    })

    let firstFetch = true
    let lowNotified = false
    const tick = async () => {
      const snapshot = await fetchSnapshot(opts.endpoint, opts.authPath)
      if (signal.aborted) return
      const previous = state()
      setState(snapshot)
      if (snapshot.ok) api.kv.set(KV_KEY, snapshot)
      if (snapshot.ok && snapshot.remaining !== null && snapshot.remaining < opts.lowThreshold)) {
        if (!lowNotified)) {
          lowNotified = true
          void api.attention.notify({
            title: "OpenRouter credits low",
            message: widgetText(snapshot),
            notification: true,
          })
        }
      } else {
        lowNotified = false
      }
      const tier = tierOf(snapshot)
      if (firstFetch || tier !== tierOf(previous)) {
        api.ui.toast({
          variant: tier === "muted" ? "warning" : tierColorVariant(tier),
          title: "OpenRouter credits",
          message: widgetText(snapshot),
          duration: 4000,
        })
      }
      firstFetch = false
    }

    void tick()
    const interval = setInterval(() => void tick(), opts.refreshIntervalMs)
    api.lifecycle.onDispose(() => clearInterval(interval))
  },
}

export default plugin