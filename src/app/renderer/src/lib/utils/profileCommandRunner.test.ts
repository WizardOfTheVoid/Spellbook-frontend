import assert from "node:assert/strict"
import test from "node:test"
import type {
  ChivCoreApi,
  CoreBatchCommand,
  CoreCallResult,
  PlayerDbProfile,
  RecordActionByPlayfabInput,
  ServerProfileAction
} from "$lib/core"
import { executeProfileAction, resolveMessageTags } from "./profileCommandRunner"

const admin = {
  id: 1,
  username: `Admin`,
  isActive: true
}

const successResult = (sentCommands: number): CoreCallResult => ({
  ok: true,
  status: 200,
  statusText: `OK`,
  data: {
    ok: true,
    data: { sentCommands }
  }
})

const player = {
  index: 1,
  name: `Alice`,
  playfabId: `PLAYER_1`,
  rawLine: `Alice PLAYER_1`
}

const gameServer = {
  id: 44,
  externalId: `lobby-44`,
  name: `Duel Server`,
  displayName: null,
  clanName: null,
  clanTag: null
}

const moderationAction: ServerProfileAction = {
  label: `Escalate`,
  actionDomain: `player`,
  delayMs: 0,
  sortOrder: 0,
  isEnabled: true,
  iconKey: `circle-info`,
  blockOnMissingVariables: false,
  commands: [
    {
      commandType: `kick`,
      sortOrder: 1,
      delayMs: 125,
      message: `Stop, [user]`,
      offenseType: `ffa`
    },
    {
      commandType: `ban`,
      sortOrder: 2,
      delayMs: 500,
      durationHours: 24,
      message: `Repeat offense: [duration]h`,
      offenseType: `toxic_behavior`
    }
  ]
}

test(`profile unban uses its configured batch and reason and records against the selected offense`, async () => {
  const batches: CoreBatchCommand[][] = []
  const records: unknown[] = []
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 25, message: `[user] cleared by [admin]` }] }
  const result = await executeProfileAction(action, { admin, player, playerId: 8, relatedActionId: 6, gameServer, serverName: gameServer.name },
    { executeBatch: async batch => { batches.push(batch); return successResult(1) } },
    async () => { assert.fail(`Unban must use its own audit endpoint`) },
    { fetchWanted: async () => null, record: async (...args) => { records.push(args) } })
  assert.equal(result.ok, true)
  assert.deepEqual(batches, [[{ commandType: `unban`, delayMs: 25, message: `Alice cleared by Admin`, playfabId: `PLAYER_1` }]])
  assert.deepEqual(records, [[{ playfabId: `PLAYER_1`, playerName: `Alice`, gameServerId: 44, reason: `Alice cleared by Admin` }, { playerId: 8, actionId: 6 }]])
})

test(`profile unban fails closed for Wanted players or unavailable Wanted status`, async () => {
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 0, message: `Cleared` }] }
  for (const fetchWanted of [async () => ({ id: 1 }), async () => { throw new Error(`Offline`) }]) {
    const result = await executeProfileAction(action, { admin, player, playerId: 8, gameServer, serverName: gameServer.name },
      { executeBatch: async () => { assert.fail(`No command may be sent`) } }, async () => {},
      { fetchWanted, record: async () => { assert.fail(`No audit without a command`) } })
    assert.equal(result.ok, false)
    assert.equal(result.sentCommands, 0)
  }
})

test(`rechecks execution context after the asynchronous Wanted lookup before sending commands`, async () => {
  let wantedChecked = false
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 0, message: `Cleared` }] }
  await assert.rejects(executeProfileAction(action, {
    admin, player, playerId: 8, gameServer, serverName: gameServer.name,
    beforeExecute: async () => {
      assert.equal(wantedChecked, true)
      throw new Error(`The current server changed.`)
    },
  }, { executeBatch: async () => { assert.fail(`No command may be sent`) } }, async () => {}, {
    fetchWanted: async () => { wantedChecked = true; return null },
    record: async () => { assert.fail(`No audit without a command`) },
  }), /current server changed/)
})

const failedResult = (sentCommands: number): CoreCallResult => ({
  ok: false,
  status: 500,
  statusText: `Internal Server Error`,
  data: {
    ok: false,
    data: { sentCommands, failedCommandIndex: null },
    error: {
      code: `RESTORE_FAILED`,
      message: `Overlay restore failed.`
    }
  }
})

test(`sends a sorted profile action to Core as one batch`, async () => {
  const batchCalls: CoreBatchCommand[][] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async (commands) => {
      batchCalls.push(commands)
      return successResult(2)
    }
  }
  const action: ServerProfileAction = {
    label: `Broadcast`,
    actionDomain: `server`,
    delayMs: 0,
    sortOrder: 0,
    isEnabled: true,
    iconKey: `circle-info`,
    blockOnMissingVariables: false,
    commands: [
      {
        commandType: `server_message`,
        sortOrder: 2,
        delayMs: 0,
        message: `Second`
      },
      {
        commandType: `server_message`,
        sortOrder: 1,
        delayMs: 0,
        message: `First`
      }
    ]
  }

  const result = await executeProfileAction(
    action,
    {
      admin,
      serverName: `Duel Server`,
      variables: [{ label: `Serversay prefix`, key: `serversay_prefix`, value: `[SB] `, sortOrder: 0 }]
    },
    core
  )

  assert.equal(batchCalls.length, 1)
  assert.deepEqual(batchCalls[0], [
    { commandType: `server_message`, message: `[SB] First`, delayMs: 0 },
    { commandType: `server_message`, message: `[SB] Second`, delayMs: 0 }
  ])
  assert.equal(result.sentCommands, 2)
})

test(`blocks the whole guarded action before Core and audit when variables are missing`, async () => {
  let coreCalls = 0
  let auditCalls = 0
  const action: ServerProfileAction = {
    ...moderationAction,
    blockOnMissingVariables: true,
    commands: [
      { commandType: `warn`, sortOrder: 0, delayMs: 0, message: `[discord_url]`, offenseType: `other` },
      { commandType: `kick`, sortOrder: 1, delayMs: 0, message: `[rules_url] [discord_url]`, offenseType: `other` }
    ]
  }
  const result = await executeProfileAction(
    action,
    { admin, serverName: `Duel Server`, player, gameServer, variables: [] },
    { executeBatch: async () => { coreCalls += 1; return successResult(2) } },
    async () => { auditCalls += 1 }
  )

  assert.equal(coreCalls, 0)
  assert.equal(auditCalls, 0)
  assert.deepEqual(result, {
    ok: false,
    message: `Duel Server does not have [discord_url], [rules_url]. Escalate was blocked.`,
    sentCommands: 0
  })
})

test(`sends an unguarded action with missing variables resolved empty`, async () => {
  const batches: CoreBatchCommand[][] = []
  const action: ServerProfileAction = {
    label: `Broadcast`,
    actionDomain: `server`,
    delayMs: 0,
    sortOrder: 0,
    isEnabled: true,
    iconKey: `circle-info`,
    blockOnMissingVariables: false,
    commands: [{
      commandType: `server_message`, sortOrder: 0, delayMs: 0, message: `Rules: [rules_url]`
    }]
  }

  const result = await executeProfileAction(
    action,
    { admin, serverName: `Duel Server`, gameServer, variables: [] },
    { executeBatch: async commands => { batches.push(commands); return successResult(1) } }
  )

  assert.equal(result.ok, true)
  assert.deepEqual(batches[0], [{ commandType: `server_message`, message: `Rules: `, delayMs: 0 }])
})

test(`the guard excludes context tags and accepts explicit fallbacks`, async () => {
  let coreCalls = 0
  const action: ServerProfileAction = {
    ...moderationAction,
    blockOnMissingVariables: true,
    commands: [{
      commandType: `warn`, sortOrder: 0, delayMs: 0,
      message: `[user] [server_name] [missing|Fallback] [empty|]`, offenseType: `other`
    }]
  }

  const result = await executeProfileAction(
    action,
    { admin, serverName: `Duel Server`, player, gameServer, variables: [] },
    { executeBatch: async () => { coreCalls += 1; return successResult(1) } },
    async () => undefined
  )

  assert.equal(result.ok, true)
  assert.equal(coreCalls, 1)
})

test(`returns partial progress from a failed Core batch`, async () => {
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async () => ({
      ok: false,
      status: 500,
      statusText: `Internal Server Error`,
      data: {
        ok: false,
        data: { sentCommands: 1, failedCommandIndex: 1 },
        error: {
          code: `INPUT_FAILED`,
          message: `Second command failed.`
        }
      }
    })
  }
  const action: ServerProfileAction = {
    label: `Broadcast`,
    actionDomain: `server`,
    delayMs: 0,
    sortOrder: 0,
    isEnabled: true,
    iconKey: `circle-info`,
    blockOnMissingVariables: false,
    commands: [
      {
        commandType: `server_message`,
        sortOrder: 1,
        delayMs: 0,
        message: `First`
      },
      {
        commandType: `server_message`,
        sortOrder: 2,
        delayMs: 250,
        message: `Second`
      }
    ]
  }

  const result = await executeProfileAction(
    action,
    { admin, serverName: `Duel Server` },
    core
  )

  assert.deepEqual(result, {
    ok: false,
    message: `Second command failed.`,
    sentCommands: 1
  })
})

test(`rejects player commands without a selected player before IPC`, async () => {
  let batchCalls = 0
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async () => {
      batchCalls += 1
      return successResult(1)
    }
  }
  const action: ServerProfileAction = {
    label: `Kick`,
    actionDomain: `player`,
    delayMs: 0,
    sortOrder: 0,
    isEnabled: true,
    iconKey: `circle-info`,
    blockOnMissingVariables: false,
    commands: [
      {
        commandType: `kick`,
        sortOrder: 1,
        delayMs: 0,
        message: `Stop FFA`
      }
    ]
  }

  const result = await executeProfileAction(
    action,
    { admin, serverName: `Duel Server`, player: null },
    core
  )

  assert.equal(batchCalls, 0)
  assert.deepEqual(result, {
    ok: false,
    message: `Player commands require a selected player.`,
    sentCommands: 0
  })
})

test(`maps kick and ban commands with their target duration and configured delays`, async () => {
  const batchCalls: CoreBatchCommand[][] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async (commands) => {
      batchCalls.push(commands)
      return successResult(2)
    }
  }
  const recordAction = async (_input: RecordActionByPlayfabInput) => undefined

  const result = await executeProfileAction(
    moderationAction,
    { admin, serverName: `Duel Server`, player, gameServer },
    core,
    recordAction
  )

  assert.deepEqual(batchCalls, [[
    {
      commandType: `kick`,
      message: `Stop, Alice`,
      delayMs: 125,
      playfabId: `PLAYER_1`
    },
    {
      commandType: `ban`,
      message: `Repeat offense: 24h`,
      delayMs: 500,
      playfabId: `PLAYER_1`,
      hours: 24
    }
  ]])
  assert.equal(result.ok, true)
})

test(`adds the action delay on top of every command delay`, async () => {
  const batchCalls: CoreBatchCommand[][] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async (commands) => {
      batchCalls.push(commands)
      return successResult(2)
    }
  }

  await executeProfileAction(
    { ...moderationAction, delayMs: 200 },
    { admin, serverName: `Duel Server`, player, gameServer },
    core,
    async () => undefined
  )

  assert.deepEqual(
    batchCalls[0]?.map((command) => command.delayMs),
    [325, 700]
  )
})

test(`normalizes hacker and maximum-duration audits at the renderer-to-server boundary`, async () => {
  const auditAttempts: RecordActionByPlayfabInput[] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async () => successResult(2)
  }
  const action: ServerProfileAction = {
    ...moderationAction,
    commands: [
      {
        commandType: `ban`,
        sortOrder: 1,
        delayMs: 0,
        durationHours: 24,
        message: `Hacking`,
        offenseType: `hacker`
      },
      {
        commandType: `ban`,
        sortOrder: 2,
        delayMs: 0,
        durationHours: 999999,
        message: `Permanent`,
        offenseType: `other`
      }
    ]
  }

  await executeProfileAction(
    action,
    { admin, serverName: `Duel Server`, player, gameServer },
    core,
    async (input) => {
      auditAttempts.push(input)
    }
  )

  assert.deepEqual(auditAttempts, [
    {
      playfabId: `PLAYER_1`,
      playerName: `Alice`,
      gameServerId: 44,
      actionType: `ban`,
      offenseType: `hacker`,
      duration: null,
      reason: `Hacking`,
      scope: `global`
    },
    {
      playfabId: `PLAYER_1`,
      playerName: `Alice`,
      gameServerId: 44,
      actionType: `ban`,
      offenseType: `other`,
      duration: null,
      reason: `Permanent`,
      scope: `local`
    }
  ])
})

test(`[offenses] counts punitive actions and excludes unban history`, () => {
  const dbProfile = {
    actions: [
      { actionType: `ban` },
      { actionType: `warn` },
      { actionType: `unban` }
    ]
  } as PlayerDbProfile

  assert.equal(
    resolveProfileMessage(`[offenses]`, { admin, serverName: `Duel Server`, dbProfile }),
    `2`
  )
})

test(`attempts every submitted audit when the first audit fails`, async () => {
  const auditAttempts: RecordActionByPlayfabInput[] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async () => successResult(2)
  }
  const recordAction = async (input: RecordActionByPlayfabInput) => {
    auditAttempts.push(input)
    if (auditAttempts.length === 1) throw new Error(`First audit failed.`)
  }

  const result = await executeProfileAction(
    moderationAction,
    { admin, serverName: `Duel Server`, player, gameServer },
    core,
    recordAction
  )

  assert.deepEqual(
    auditAttempts.map(({ actionType }) => actionType),
    [`kick`, `ban`]
  )
  assert.deepEqual(auditAttempts.map(({ gameServerId }) => gameServerId), [44, 44])
  assert.deepEqual(result, {
    ok: false,
    message: `Command sent, but audit record failed: First audit failed.`,
    sentCommands: 2,
    auditFailed: true
  })
})

test(`attempts every submitted audit and reports the Core failure`, async () => {
  const auditAttempts: RecordActionByPlayfabInput[] = []
  const core: Pick<ChivCoreApi, "executeBatch"> = {
    executeBatch: async () => failedResult(2)
  }
  const recordAction = async (input: RecordActionByPlayfabInput) => {
    auditAttempts.push(input)
    if (auditAttempts.length === 1) throw new Error(`First audit failed.`)
  }

  const result = await executeProfileAction(
    moderationAction,
    { admin, serverName: `Duel Server`, player, gameServer },
    core,
    recordAction
  )

  assert.deepEqual(
    auditAttempts.map(({ actionType }) => actionType),
    [`kick`, `ban`]
  )
  assert.deepEqual(result, {
    ok: false,
    message: `Overlay restore failed.`,
    sentCommands: 2
  })
})

test(`reports an audit failure when the current server was not resolved`, async () => {
  let auditCalls = 0
  const result = await executeProfileAction(
    moderationAction,
    { admin, serverName: `Duel Server`, player, gameServer: null },
    { executeBatch: async () => successResult(2) },
    async () => {
      auditCalls += 1
    }
  )

  assert.equal(auditCalls, 0)
  assert.deepEqual(result, {
    ok: false,
    message: `Command sent, but audit record failed: Current server was not resolved.`,
    sentCommands: 2,
    auditFailed: true
  })
})

test(`expands server variable tags alongside the built-in tags`, () => {
  assert.equal(
    resolveProfileMessage(`[admin_player] warned [user] - [nope] - [prefixed]`, {
      admin,
      serverName: `Duel Server`,
      player,
      variables: [
        { label: `Admin Player`, key: `admin_player`, value: `JohnChivalry`, sortOrder: 0 },
        { label: `Prefixed`, key: `prefixed`, value: `[admin] says`, sortOrder: 1 }
      ]
    }),
    `JohnChivalry warned Alice -  - [admin] says`
  )
})

test(`never re-expands a variable value that contains its own tag`, () => {
  assert.equal(
    resolveProfileMessage(`[loop]`, {
      admin,
      serverName: `Duel Server`,
      variables: [{ id: 1, gameServerId: 1, label: `Loop`, key: `loop`, value: `[loop] done`, sortOrder: 0 }]
    }),
    `[loop] done`
  )
})

test(`a variable cannot shadow a built-in tag`, () => {
  assert.equal(
    resolveProfileMessage(`[admin]`, {
      admin,
      serverName: `Duel Server`,
      variables: [{ id: 1, gameServerId: 1, label: `Admin`, key: `admin`, value: `hijacked`, sortOrder: 0 }]
    }),
    `Admin`
  )
})

test(`resolves the server tags from the active game server`, () => {
  assert.equal(
    resolveProfileMessage(`[clan_tag] [clan_name] on [server_name]`, {
      admin,
      serverName: `Duel Server`,
      gameServer: {
        id: 1,
        externalId: `lobby-1`,
        name: `[TT]DUEL`,
        displayName: `Templars Duel`,
        clanName: `The Templars`,
        clanTag: `TT`
      }
    }),
    `TT The Templars on Templars Duel`
  )
})

test(`[server_name] falls back to the raw name and missing clan fields resolve empty`, () => {
  assert.equal(
    resolveProfileMessage(`[server_name]|[clan_tag]|`, {
      admin,
      serverName: `Duel Server`,
      gameServer: { id: 1, externalId: `lobby-1`, name: `[TT]DUEL`, displayName: null, clanName: null, clanTag: null }
    }),
    `[TT]DUEL||`
  )
})

test(`resolves server tags empty without an active game server`, () => {
  assert.equal(
    resolveProfileMessage(`[server_name]`, { admin, serverName: `Duel Server` }),
    ``
  )
})

test(`a variable cannot shadow a server tag`, () => {
  assert.equal(
    resolveProfileMessage(`[clan_tag]`, {
      admin,
      serverName: `Duel Server`,
      gameServer: {
        id: 1,
        externalId: `lobby-1`,
        name: `[TT]DUEL`,
        displayName: null,
        clanName: null,
        clanTag: `TT`
      },
      variables: [{ id: 1, gameServerId: 1, label: `Clan tag`, key: `clan_tag`, value: `hijacked`, sortOrder: 0 }]
    }),
    `TT`
  )
})

function resolveProfileMessage(
  message: string,
  context: Parameters<typeof resolveMessageTags>[2]
): string {
  return resolveMessageTags(
    message,
    { commandType: `server_message`, sortOrder: 0, delayMs: 0, message },
    context
  )
}
