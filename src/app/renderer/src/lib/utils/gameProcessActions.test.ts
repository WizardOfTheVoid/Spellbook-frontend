import assert from "node:assert/strict"
import test from "node:test"
import type { ServerProfileAction } from "$lib/core"
import {
	gameCommandIssue,
	profileActionRequiresGameProcess,
} from "./gameProcessActions"

test("identifies profile actions that contain in-game moderation commands", () => {
	assert.equal(profileActionRequiresGameProcess(action("server_message")), false)
	for (const commandType of ["warn", "kick", "ban"] as const) {
		assert.equal(profileActionRequiresGameProcess(action(commandType)), true)
	}
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


test(`an incorrect console binding prevents game commands regardless of game availability`, () => {
  assert.equal(gameCommandIssue(true, false), null)
  assert.ok(gameCommandIssue(false, false))
  assert.ok(gameCommandIssue(true, true))
  assert.equal(gameCommandIssue(true, true), gameCommandIssue(false, true))
  assert.notEqual(gameCommandIssue(false, true), gameCommandIssue(false, false))
})
