import type { ServerProfileAction } from "$lib/core"
import { consoleSetupIssue } from '../../../../shared/consoleSetup'

export const GAME_PROCESS_REQUIRED_TOOLTIP = "Chivalry 2 must be running."

export function gameCommandIssue(gameAvailable: boolean, commandsBlocked = false, issue?: string | null): string | null {
	return commandsBlocked ? issue ?? consoleSetupIssue : gameAvailable ? null : GAME_PROCESS_REQUIRED_TOOLTIP
}

export function profileActionRequiresGameProcess(action: ServerProfileAction): boolean {
	return action.commands.some(command => command.commandType !== "server_message")
}
