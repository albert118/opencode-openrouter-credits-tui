import solidTransformPlugin from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["src/tui.tsx"],
  outdir: "dist",
  target: "bun",
  external: ["@opentui/*", "solid-js", "@opencode/plugin", "@opencode-ai/plugin"],
  plugins: [solidTransformPlugin],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}