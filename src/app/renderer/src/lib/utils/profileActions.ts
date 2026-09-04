import type { ServerProfileAction } from "$lib/core";
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
			const delay = command.delayMs > 0 ? ` after +${command.delayMs}ms` : "";
			return `${index + 1}. ${type}${duration}${delay}`;
		})
		.join(" / ");
}

export function actionCommandCount(action: ServerProfileAction): string {
	const count = action.commands.length;
	return `${count} ${count === 1 ? "command" : "commands"}`;
}

export function profileActionIcon(action: ServerProfileAction): { name: string, type: `light` | `brands` } {
	const icon = serverProfileActionIcons.find(candidate => candidate.key === action.iconKey)
		?? serverProfileActionIcons.find(candidate => candidate.key === `circle-info`)!
	return { name: icon.name, type: icon.type }
}

export function profileActionIconColor(action: ServerProfileAction): string {
	const types = new Set(action.commands.map(command => command.commandType))
	if (types.has(`ban`)) return `#ff6157`
	if (types.has(`kick`)) return `var(--color-accent-tertiary)`
	return `var(--color-light-primary)`
}
