import type { ServerProfileAction } from "$lib/core"

export const GAME_PROCESS_REQUIRED_TOOLTIP = "Chivalry 2 must be running."

export function profileActionRequiresGameProcess(action: ServerProfileAction): boolean {
	return action.commands.some(command => command.commandType !== "server_message")
}
