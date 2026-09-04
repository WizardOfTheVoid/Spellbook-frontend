import assert from "node:assert/strict"
import test from "node:test"
import type { ServerProfileAction } from "$lib/core"
import {
	GAME_PROCESS_REQUIRED_TOOLTIP,
	profileActionRequiresGameProcess,
} from "./gameProcessActions"

test("identifies profile actions that contain in-game moderation commands", () => {
	assert.equal(profileActionRequiresGameProcess(action("server_message")), false)
	for (const commandType of ["warn", "kick", "ban"] as const) {
		assert.equal(profileActionRequiresGameProcess(action(commandType)), true)
	}
	assert.equal(GAME_PROCESS_REQUIRED_TOOLTIP, "Chivalry 2 must be running.")
})

function action(commandType: "server_message" | "warn" | "kick" | "ban"): ServerProfileAction {
	return {
		label: "Test",
		actionDomain: commandType === "server_message" ? "server" : "player",
		delayMs: 0,
		sortOrder: 0,
		isEnabled: true,
		iconKey: "ban",
		blockOnMissingVariables: false,
		commands: [{ commandType, sortOrder: 0, delayMs: 0, message: "Test" }],
	}
}
