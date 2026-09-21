import type { ServerProfileAction, ServerProfileGraph } from "$lib/core";
import { serverProfileActionIcons } from '@spellbook/shared/serverProfileActionIcons.js'

const MAX_DURATION_HOURS = 999999;

export function actionDescription(action: ServerProfileAction, fallback: string): string {
	return action.description?.trim() || fallback;
}

export function actionCommandSummary(action: ServerProfileAction): string {
	return action.commands
		.map((command, index) => {
			const type = command.commandType.replace("_", " ");
			const duration =
				command.durationHours === MAX_DURATION_HOURS ? " MAX"
				: command.durationHours ? ` ${command.durationHours}h`
				: "";
			return `${index + 1}. ${type}${duration}`
		})
		.join(" / ");
}

export function profileActionIcon(action: ServerProfileAction): { name: string, type: `light` | `brands` } {
	const icon = serverProfileActionIcons.find(candidate => candidate.key === action.iconKey)
		?? serverProfileActionIcons.find(candidate => candidate.key === `circle-info`)!
	return { name: icon.name, type: icon.type }
}

export function profileActionIconColor(action: ServerProfileAction): string {
	const types = new Set(action.commands.map(command => command.commandType))
	return actionTypeIconColor(types.has(`ban`) || types.has(`incremental_ban`) ? `ban` : types.has(`kick`) ? `kick` : ``)
}

export function actionTypeOrder(type: string): number {
  return type === `ban` || type === `incremental_ban` ? 0 : type === `kick` ? 1 : 2
}

export function actionTypeIconColor(type: string): string {
  return type === `ban` ? `#ff6157` : type === `kick` ? `var(--color-accent-tertiary)` : `var(--color-light-primary)`
}

export function profileActionOrder(action: ServerProfileAction): number {
  return Math.min(2, ...action.commands.map(command => actionTypeOrder(command.commandType)))
}

export function visibleServerActionProfiles(graphs: readonly ServerProfileGraph[]): ServerProfileGraph[] {
  return graphs.map(graph => ({
    ...graph,
    actions: graph.actions.filter(action =>
      action.isEnabled && action.actionDomain === `server` && action.showInGameServerActions !== false),
  })).filter(graph => graph.actions.length > 0)
}
