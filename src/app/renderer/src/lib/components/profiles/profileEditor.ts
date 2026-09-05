import type { ProfileOwner, ProfileOwnerOption, ServerProfileAction, ServerProfileCommand, ServerProfileGraph, ServerProfileGraphInput, ServerProfileOwner, UserSession } from '$lib/core'

const names = new Intl.Collator(`en`, { sensitivity: `base`, usage: `search` })

export function uniqueCopyName(name: string, existing: readonly string[]): string {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? ` (copy)` : ` (copy ${number})`
    const stem = name.trim().slice(0, 255 - suffix.length).replace(/[\uD800-\uDBFF]$/u, ``)
    const candidate = `${stem}${suffix}`
    if (!existing.some(value => names.compare(value.trim(), candidate) === 0)) return candidate
  }
}

export function canManageProfile(owner: ServerProfileOwner | null, action: `create` | `edit` | `delete`,
  user: Pick<UserSession, `id` | `isSuperadmin` | `isActive`> | null, owners: readonly ProfileOwnerOption[]): boolean {
  if (!user?.isActive || !owner) return false
  if (user.isSuperadmin) return true
  if (owner.type === `system`) return false
  if (owner.type === `user`) return owner.id === user.id
  const permissions = owners.find(option => option.type === `team` && option.id === owner.id)?.permissions ?? []
  return permissions.includes(`admin`) || permissions.includes(action)
}

export function uniqueNewName(name: string, existing: readonly string[]): string {
  return existing.some(value => names.compare(value.trim(), name.trim()) === 0) ? uniqueCopyName(name, existing) : name
}

function cloneCommand(command: ServerProfileCommand, sortOrder: number): ServerProfileCommand {
  return {
    commandType: command.commandType, sortOrder, delayMs: command.delayMs,
    durationHours: command.durationHours ?? null, message: command.message, offenseType: command.offenseType ?? null
  }
}

export function cloneActions(actions: readonly ServerProfileAction[]): ServerProfileAction[] {
  return actions.map((action, sortOrder) => ({
    label: action.label, description: action.description ?? null, actionDomain: action.actionDomain,
    delayMs: action.delayMs, sortOrder, isEnabled: action.isEnabled, iconKey: action.iconKey,
    blockOnMissingVariables: action.blockOnMissingVariables,
    commands: action.commands.map(cloneCommand)
  }))
}

export function duplicateAction(actions: readonly ServerProfileAction[], index: number): ServerProfileAction[] {
  const source = actions[index]
  if (!source) return [...actions]
  const [copy] = cloneActions([source])
  copy.label = uniqueCopyName(source.label, actions.map(action => action.label))
  const result = [...actions]
  result.splice(index + 1, 0, copy)
  return result.map((action, sortOrder) => ({ ...action, sortOrder }))
}

export function duplicateCommand(commands: readonly ServerProfileCommand[], index: number): ServerProfileCommand[] {
  const source = commands[index]
  if (!source) return [...commands]
  const result = [...commands]
  result.splice(index + 1, 0, cloneCommand(source, index + 1))
  return result.map((command, sortOrder) => ({ ...command, sortOrder }))
}

export function replaceProfileActions(profile: ServerProfileGraph, actions: readonly ServerProfileAction[]): ServerProfileGraph {
  return { ...profile, actions: cloneActions(actions) }
}

export function newProfileDraft(owner: ProfileOwner, source: ServerProfileGraph | null, existingNames: readonly string[]): ServerProfileGraph {
  return {
    profile: {
      id: 0, owner, name: source ? uniqueCopyName(source.profile.name, existingNames)
        : uniqueNewName(`New profile`, existingNames),
      description: source?.profile.description ?? null, isDefault: false
    },
    actions: cloneActions(source?.actions ?? []), servers: [], availableVariables: []
  }
}

export function profileInput(profile: ServerProfileGraph): ServerProfileGraphInput {
  return {
    name: profile.profile.name, description: profile.profile.description ?? null,
    serverIds: profile.servers.map(server => server.gameServerId), actions: cloneActions(profile.actions)
  }
}

export function profileChanges(profile: ServerProfileGraph, saved: ServerProfileGraph): ServerProfileGraphInput {
  const current = profileInput(profile)
  const previous = profileInput(saved)
  return Object.fromEntries(Object.entries(current).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(previous[key as keyof ServerProfileGraphInput])
  ))
}
