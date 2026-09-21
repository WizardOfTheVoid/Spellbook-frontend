import type { ActiveServerProfile, ServerProfileGraph } from '$lib/core'

export function activeProfileGraphs(active: ActiveServerProfile | null): ServerProfileGraph[] {
  return active ? active.profiles ?? [active.profile] : []
}

export function activeProfileVariables(active: ActiveServerProfile | null) {
  return Array.from(new Map(activeProfileGraphs(active).flatMap(graph =>
    graph.availableVariables.map(variable => [variable.key, variable] as const),
  )).values())
}
