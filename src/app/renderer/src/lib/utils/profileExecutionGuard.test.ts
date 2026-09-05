import assert from "node:assert/strict"
import test from "node:test"
import type { ChivCoreApi, ChivServerApi, CoreCallResult, ServerProfileAction, ServerProfileGraph } from "$lib/core"
import { authState } from "$lib/auth/user"
import { profileExecutionGuard } from "./profileExecutionGuard"

const action = (id: number, isEnabled: boolean): ServerProfileAction => ({
  id,
  profileId: 4,
  label: `Test action`,
  actionDomain: `server`,
  delayMs: 0,
  sortOrder: 0,
  isEnabled,
  iconKey: `circle-info`,
  blockOnMissingVariables: false,
  commands: []
})

const graph = (actions: ServerProfileAction[]): ServerProfileGraph => ({
  profile: {
    id: 4,
    owner: { type: `team`, id: 7 },
    name: `Team profile`,
    description: null,
    isDefault: false,
    createdAt: `2026-09-05T00:00:00.000Z`,
    updatedAt: `2026-09-05T00:00:00.000Z`
  },
  actions,
  servers: [],
  availableVariables: []
})

function installApis(actions: ServerProfileAction[], activeFailure?: CoreCallResult): void {
  const snapshot = {
    version: 1,
    observedAt: `2026-09-05T00:00:00.000Z`,
    gameServerId: 9,
    externalId: `server-9`,
    serverName: `Duel`,
    serverAddress: null,
    players: [],
    parseWarnings: []
  }
  const activeResult: CoreCallResult = activeFailure ?? {
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, data: { source: `assigned`, profile: graph(actions), profiles: [graph(actions)], gameServer: null, variables: [] } }
  }
  Object.assign(globalThis, {
    window: {
      chivCore: { currentGameSnapshot: async () => snapshot } as unknown as ChivCoreApi,
      chivServer: {
        serverProfiles: { active: async () => activeResult }
      } as ChivServerApi
    }
  })
  authState.set({
    loading: false,
    user: {
      id: 3,
      discordId: null,
      username: `admin`,
      displayName: `Admin`,
      playfabId: null,
      avatarUrl: null,
      isActive: true,
      isSuperadmin: false,
      wantedCreationEnabled: false,
      onboardingComplete: true
    }
  })
}

test(`allows an active enabled action`, async () => {
  installApis([action(12, true)])
  await profileExecutionGuard(3, `server-9`, false, 12)()
})

test(`rejects an action absent from the active profile`, async () => {
  installApis([action(13, true)])
  await assert.rejects(
    profileExecutionGuard(3, `server-9`, false, 12),
    /This profile action is no longer available\. Reopen the actions\./
  )
})

test(`rejects a disabled action in the active profile`, async () => {
  installApis([action(12, false)])
  await assert.rejects(
    profileExecutionGuard(3, `server-9`, false, 12),
    /This profile action is no longer available\. Reopen the actions\./
  )
})

test(`fails closed when the active profile lookup fails`, async () => {
  installApis([], {
    ok: false,
    status: 404,
    statusText: `Not Found`,
    data: { ok: false, error: { code: `NOT_FOUND`, message: `Profile unavailable.` } }
  })
  await assert.rejects(
    profileExecutionGuard(3, `server-9`, false, 12),
    /This profile action is no longer available\. Reopen the actions\./
  )
})
