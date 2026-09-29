import type { Options, ProviderId } from "../core"
import type { Provider } from "./types"
import { openrouterProvider } from "./openrouter"
import { weaveProvider } from "./weave"

const registry: Record<ProviderId, Provider> = {
  openrouter: openrouterProvider,
  weave: weaveProvider,
}

export function getProvider(id: ProviderId): Provider {
  return registry[id] ?? registry.openrouter
}