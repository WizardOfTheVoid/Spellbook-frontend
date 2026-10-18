import type { ServerProfileAction, ServerProfileCommand, ServerProfileGraph } from '$lib/core'

export type ProfileCommandDraft = Omit<ServerProfileCommand, `commandType` | `delayMs`> & {
  commandType: ServerProfileCommand[`commandType`] | ``
  delayMs: number | ``
}
export type ProfileActionDraft = Omit<ServerProfileAction, `actionDomain` | `delayMs` | `commands`> & {
  actionDomain: ServerProfileAction[`actionDomain`] | ``
  delayMs: number | ``
  commands: ProfileCommandDraft[]
}
export type ProfileDraft = Omit<ServerProfileGraph, `actions`> & { actions: ProfileActionDraft[] }

export function draftNumber(value: string): number | `` {
  return value.trim() ? Number(value) : ``
}

export function newCommand(sortOrder: number): ProfileCommandDraft {
  return { commandType: ``, sortOrder, delayMs: 0, durationHours: null,
    message: `[user], please follow server rules.`, offenseType: null }
}

export function newAction(label: string, sortOrder: number): ProfileActionDraft {
  return { label, description: null, actionDomain: ``, delayMs: 0, sortOrder, isEnabled: true,
    iconKey: `circle-info`, blockOnMissingVariables: false, showInGameServerActions: true,
    commands: [newCommand(0)] }
}
