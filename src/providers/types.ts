import type { Options, ProviderId, Snapshot } from "../core"

export type Provider = {
  id: ProviderId
  resolveKey(opts: Options): string | null
  fetch(opts: Options): Promise<unknown>
  parse(raw: unknown): Snapshot
}