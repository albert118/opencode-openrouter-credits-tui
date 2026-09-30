# opencode-usage-tui

A persistent [OpenRouter](https://openrouter.ai) credits widget and notifier for [OpenCode](https://opencode.ai/) **v2** TUI plugins.

Renders a compact, always-visible line into the `home.footer.status` slot showing your API credit balance, usage, and reset period. It refreshes automatically, paints instantly from a persisted snapshot, degrades to a muted state on network failure, and notifies you when credits run low.

> [!IMPORTANT]
> This plugin targets **opencode v2** (`@opencode/plugin/tui`). V1 TUI plugins do not run in v2, and **this version does not run in opencode v1**.
> - On opencode 1.x, install the last v1-compatible release instead: `opencode-usage-tui@0.4.x` (config in `tui.json(c)` with the v1 `"plugin"` array / tuple form).
> - On v2, the first start auto-migrates `tui.json(c)` to `cli.json`.

## Screenshots/Examples

**Widget:**

![widget example](docs/widget-example.png)

**Verbose mode:**

![verbose mode example](docs/verbose-mode-example.png)

## Features

- **Persistent `home.footer.status` widget:** a compact status row on the home route; append-mode slot, so it coexists with OpenCode's internal footers.
- **15-minute auto-refresh:** auto-updates to keep you informed. No manually checking a command to keep up to date.
- **Instant paint:** the last-known snapshot is seeded from the durable store before the first network round-trip, and written back after each successful fetch.
- **Low-credit notification:** notifies when remaining balance drops below a configurable threshold.
- **Toast on first fetch / tier change:** visual feedback when the status line changes tier or first loads.
- **Muted failure state:** missing key, API errors, or parse failures degrade to `Credits · ⚠ unavailable`.
- **Configurable:** refresh interval, endpoint, low-credit threshold, and auth file path via plugin options.
- **Widget insights (verbose):** opt-in `verbose` mode adds a days-left estimate, free-model daily requests remaining, and weekly/monthly usage.
- **Secure:** No key is ever hardcoded in the plugin; it is read at runtime and sent only to the configured provider endpoint as a Bearer token.

## Requirements

- OpenCode **v2** (npm plugins are auto-installed by Bun into OpenCode's plugin cache at startup).
- An OpenRouter API key. The plugin reads it from `auth.json` in OpenCode's data dir, which OpenCode itself writes:

| OS      | data dir (`auth.json` lives here)                                                     |
| ------- | ------------------------------------------------------------------------------------- |
| macOS   | `~/.local/share/opencode/auth.json`                                                   |
| Linux   | `~/.local/share/opencode/auth.json` (or `$XDG_DATA_HOME/opencode/auth.json` when set) |
| Windows | `%USERPROFILE%\.local\share\opencode\auth.json`                                       |

> [!NOTE] macOS
> OpenCode uses the same `~/.local/share/opencode` paths on macOS as on Linux — **not** `~/Library/Application Support` (that only applies to admin-managed config at `/Library/Application Support/opencode/`). Finder hides dotfiles — press `Cmd+Shift+.` to reveal `~/.local/…`.

```json
{
	"openrouter": {
		"type": "api",
		"key": "sk-or-v1-..."
	}
}
```

## Install

Add the package to the `plugins` array in your OpenCode v2 config — `~/.config/opencode/cli.json` on macOS/Linux, `%USERPROFILE%\.config\opencode\cli.json` on Windows (`.jsonc` files load too). The old `tui.json(c)` is auto-migrated to `cli.json` on first v2 start:

```jsonc
{
	"plugins": [
		{
			"package": "opencode-usage-tui",
			"options": {
				"refreshIntervalMs": 1800000,
				"lowThreshold": 5
			}
		}
	]
}
```

Restart OpenCode. The widget should now render in the home footer status row of the TUI. Alternatively, install it from the OpenCode CLI: `opencode plugin add opencode-usage-tui --global`.

## Where opencode stores files

|                                          | macOS                            | Linux                                             | Windows                                      |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| **data dir** (`auth.json`)               | `~/.local/share/opencode`        | `~/.local/share/opencode` (`$XDG_DATA_HOME` wins) | `%USERPROFILE%\.local\share\opencode`        |
| **config** (`cli.json`)                  | `~/.config/opencode`             | `~/.config/opencode` (`$XDG_CONFIG_HOME` wins)    | `%USERPROFILE%\.config\opencode`             |
| **npm plugin cache**                     | `~/.cache/opencode/node_modules` | `~/.cache/opencode/node_modules`                  | `%USERPROFILE%\.cache\opencode\node_modules` |

## Options

Pass options in the object form of the `plugins` array:

```jsonc
{
	"plugins": [
		{
			"package": "opencode-usage-tui",
			"options": {
				"refreshIntervalMs": 1800000,
				"lowThreshold": 5,
				"authPath": "/Users/me/opencode/auth.json" // e.g. C:\Users\me\opencode\auth.json on Windows
			}
		}
	]
}
```

| Option              | Type    | Default                                                                       | Description                                                                                                                                                                                                                                                                                            |
| ------------------- | ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `refreshIntervalMs` | number  | `900000` (15 min)                                                             | How often to re-fetch the credits snapshot.                                                                                                                                                                                                                                                            |
| `endpoint`          | string  | `https://openrouter.ai/api/v1/auth/key`                                       | OpenRouter endpoint to query.                                                                                                                                                                                                                                                                          |
| `lowThreshold`      | number  | `10`                                                                          | Remaining balance (in USD) below which a low-credit notification fires. Set to 0 to disable.                                                                                                                                                                                                           |
| `verbose`           | boolean | `false`                                                                       | Show extended info: days-left estimate, free-model requests remaining, and weekly/monthly usage.                                                                                                                                                                                                       |
| `authPath`          | string  | `$XDG_DATA_HOME/opencode/auth.json`, else `~/.local/share/opencode/auth.json` | Absolute path to the `auth.json` holding `openrouter.key`. The default resolves the same on every OS (OpenCode does not use `~/Library` on macOS) — no tilde expansion is performed, so pass an absolute path when overriding (e.g. `/Users/me/opencode/auth.json`, `C:\Users\me\opencode\auth.json`). |
| `provider`          | string  | `openrouter`                                                                   | Which provider to poll: `openrouter` (credit balance) or `weave` (hosted Weave Router spend). Anything else falls back to `openrouter`. |
| `apiKey`            | string  | `""`                                                                            | Weave only. The provisioned read-only analytics key (`ra_…`), sent as `Authorization: Bearer <apiKey>`. No key means the Weave widget shows `unavailable`. |
| `baseUrl`           | string  | `https://router.workweave.ai`                                                   | Weave only. Base URL of the hosted Weave Router instance to poll. |

> All monetary values shown by the widget are in USD — OpenRouter reports credit balances in USD, and Weave rows are costed in USD.

## OpenRouter (usage)

The **default** provider shows your OpenRouter credit balance. No configuration is needed beyond an API key in `auth.json` (opencode writes it when you log in):

- The plugin reads `openrouter.key` from `auth.json` at runtime — it is never hardcoded. Override the location with `authPath` if your `auth.json` lives elsewhere.
- Each refresh calls `GET {endpoint}` (default `https://openrouter.ai/api/v1/auth/key`) with the key as a Bearer token and parses `limit`, `limit_remaining`, `limit_reset`, and the `usage_*` fields.
- The line reads `Credits · 🟢 $75.00 / $100.00 (75%) · weekly` (emoji tier by % remaining: green >50%, yellow >25%, orange >10%, red below). With `"verbose": true` it appends a days-left estimate, free-model requests remaining, and weekly/monthly usage.
- Below `lowThreshold` (default `$10`) a low-credit notification fires, deduplicated until credits recover. Set `lowThreshold` to `0` to disable it.
- Failures degrade to `Credits · ⚠ unavailable`.

```jsonc
{
	"plugins": [
		{
			"package": "opencode-usage-tui",
			"options": {
				"endpoint": "https://openrouter.ai/api/v1/auth/key",
				"lowThreshold": 10,
				"authPath": "/Users/me/opencode/auth.json",
				"verbose": false
			}
		}
	]
}
```

## Weave Router (usage)

The widget can also show **monthly spend** from a hosted [Weave Router](https://router.workweave.ai) instance instead of an OpenRouter credit balance. Weave is a spend model (it tracks cost, not a pre-funded pool), so there is no balance/limit/reset — the widget polls the analytics export and sums per-request cost.

- Set `"provider": "weave"` and pass your read-only analytics key as `"apiKey"` (an `ra_…` key, provisioned in the Weave dashboard/setup flow — it can read analytics but cannot route or infer). The key is sent only to the configured `baseUrl` as a Bearer token.
- The widget fetches `GET {baseUrl}/v1/analytics/routing-decisions?since=<month-start>&limit=1000`, cursor-paginates the NDJSON export, and aggregates `actual_input_cost_usd + actual_output_cost_usd` per row.
- The line reads `Spend · $12.34 · 850 req` (month-to-date spend and request count), and once a second sample is available it appends an estimated `· ≈$2.1/day` burn rate.
- Weave has no low-credit alert: the `lowThreshold` notification is balance-mode (OpenRouter) only. Failures degrade to `Credits · ⚠ unavailable` just like OpenRouter.

```jsonc
{
	"plugins": [
		{
			"package": "opencode-usage-tui",
			"options": {
				"provider": "weave",
				"apiKey": "ra_...",
				"baseUrl": "https://router.workweave.ai"
			}
		}
	]
}
```

## Development

```sh
bun install
bun run build           # Bun.build (Solid transform) → dist/
bun run typecheck       # tsc --emitDeclarationOnly
bun test                # unit tests for the pure helpers + the fake-context plugin tests
npm pack --dry-run      # inspect the publish tarball
```

The source is split so the pure logic is testable without the TUI/Solid runtime:

```
opencode-usage-tui/
├── src/
│   ├── tui.tsx         # v2 plugin entry: Plugin.define + home.footer.status widget
│   ├── tui.test.ts     # fake-context tests (no JSX execution)
│   ├── core.ts         # Core logic: fetch, auth, parse, format, options, theme mapping
│   ├── core.test.ts    # bun test unit tests
│   └── providers/      # openrouter + weave providers
├── build.ts            # Bundles src/tui.tsx with @opentui/solid's transform
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

## License

MIT. See [LICENSE](LICENSE).