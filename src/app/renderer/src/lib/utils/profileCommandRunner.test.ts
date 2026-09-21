import { prepareAction } from '@spellbook/shared/actions/prepareAction'
import assert from "node:assert/strict"
import test from "node:test"
import { EventEmitter, once } from 'node:events'
import type {
  ChivCoreApi,
  CoreBatchCommand,
  CoreCallResult,
  PlayerDbProfile,
  RecordActionByPlayfabInput,
  ServerProfileAction
} from "$lib/core"
import { executeProfileAction as executeRecipe, resolveMessageTags } from "./profileCommandRunner"

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
  name: `Samwise`,
  playfabId: `PLAYER_1`,
  rawLine: `Samwise PLAYER_1`
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
    { validate: async () => null, record: async (...args) => { records.push(args) } })
  assert.equal(result.ok, true)
  assert.deepEqual(batches, [[{ commandType: `unban`, delayMs: 25, message: `Samwise cleared by Admin`, playfabId: `PLAYER_1` }]])
  assert.deepEqual(records, [[{ playfabId: `PLAYER_1`, playerName: `Samwise`, gameServerId: 44, reason: `Samwise cleared by Admin` }, { playerId: 8, actionId: 6 }]])
})

test(`messages in a player action do not add offenses while explicit warns do`, async () => {
  for (const sentCommands of [1, 2]) {
    const recorded: RecordActionByPlayfabInput[] = []
    const action: ServerProfileAction = {
      ...moderationAction,
      commands: [
        { commandType: `server_message`, sortOrder: 0, delayMs: 0, message: `Hello [user]` },
        { commandType: `warn`, sortOrder: 1, delayMs: 0, message: `Stop [user]`, offenseType: `ffa` }
      ]
    }
    const result = await executeProfileAction(action, { admin, player, gameServer, serverName: gameServer.name },
      { executeBatch: async () => successResult(sentCommands) },
      async input => { recorded.push(input) })
    assert.equal(result.ok, true)
    assert.deepEqual(recorded.map(input => input.actionType), sentCommands === 1 ? [] : [`warn`])
  }
})

test(`profile unban fails closed for inactive bans or unavailable ban status`, async () => {
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 0, message: `Cleared` }] }
  for (const validate of [async () => { throw new Error(`No active ban`) }, async () => { throw new Error(`Offline`) }]) {
    const result = await executeProfileAction(action, { admin, player, playerId: 8, gameServer, serverName: gameServer.name },
      { executeBatch: async () => { assert.fail(`No command may be sent`) } }, async () => {},
      { validate, record: async () => { assert.fail(`No audit without a command`) } })
    assert.equal(result.ok, false)
    assert.equal(result.sentCommands, 0)
  }
})

test(`rechecks execution context after the asynchronous ban validation before sending commands`, async () => {
  let wantedChecked = false
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 0, message: `Cleared` }] }
  await assert.rejects(executeProfileAction(action, {
    admin, player, playerId: 8, gameServer, serverName: gameServer.name,
    beforeExecute: async () => {
      assert.equal(wantedChecked, true)
      throw new Error(`The current server changed.`)
    },
  }, { executeBatch: async () => { assert.fail(`No command may be sent`) } }, async () => {}, {
    validate: async () => { wantedChecked = true; return null },
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

test(`expanded unban submissions never audit a following unsent ban`, async () => {
  for (const sentCommands of [1, 2, 4, 5]) {
    const records: string[] = []
    const action: ServerProfileAction = {
      ...moderationAction,
      commands: [
        { commandType: `unban`, sortOrder: 0, delayMs: 0, message: `Cleared` },
        { commandType: `ban`, sortOrder: 1, delayMs: 0, durationHours: 1, message: `Reason`, offenseType: `other` }
      ]
    }
    const result = await executeProfileAction(action, { admin, player, playerId: 8, gameServer, serverName: gameServer.name },
      { executeBatch: async () => failedResult(sentCommands) },
      async input => { records.push(input.actionType) },
      { validate: async () => null, record: async () => { records.push(`unban`) } })
    assert.equal(result.sentCommands, sentCommands)
    assert.deepEqual(records, sentCommands > 4 ? [`unban`, `ban`] : [`unban`])
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
  assert.deepEqual(batches[0], [{ commandType: `server_message`, message: `Rules:`, delayMs: 0 }])
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
      message: `Stop, Samwise`,
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
      playerName: `Samwise`,
      gameServerId: 44,
      actionType: `ban`,
      offenseType: `hacker`,
      duration: null,
      reason: `Hacking`,
      scope: `global`
    },
    {
      playfabId: `PLAYER_1`,
      playerName: `Samwise`,
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

test(`blocks a ban before submission when the current server was not resolved`, async () => {
  let auditCalls = 0
  const result = await executeProfileAction(
    moderationAction,
    { admin, serverName: `Duel Server`, player, gameServer: null },
    { executeBatch: async () => { assert.fail(`Unresolved bans must not reach Core`) } },
    async () => {
      auditCalls += 1
    }
  )

  assert.equal(auditCalls, 0)
  assert.equal(result.ok, false)
  assert.equal(result.sentCommands, 0)
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
    `JohnChivalry warned Samwise -  - [admin] says`
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

function executeProfileAction(action: ServerProfileAction, context: Parameters<typeof executeRecipe>[1], core: Pick<ChivCoreApi, `executeBatch`>, ...rest: [Parameters<typeof executeRecipe>[3]?, Parameters<typeof executeRecipe>[4]?]) {
  return executeRecipe(action, context, { executeProfileRecipe: async payload => {
    const prepared = prepareAction(payload.recipe, payload.target, payload.context)
    return { result: await core.executeBatch(prepared.commands), prepared }
  } }, rest[0], rest[1], async () => {})
}

test(`local incremental bans execute and record the resolved duration, including partial submissions`, async () => {
  const command = { commandType: `incremental_ban` as const, sortOrder: 0, delayMs: 0, message: `Ban [duration]`, offenseType: `griefing` as const,
    incrementalBan: { windowDays: 30 as const, offenseTypes: null, stages: [{ banCount: 1, durationHours: 24 }, { banCount: 4, durationHours: 72 }] } }
  const action = { ...moderationAction, commands: [command,
    { commandType: `server_message` as const, sortOrder: 1, delayMs: 0, message: `[action_type] [duration]` }] }
  for (const sent of [0, 1, 2]) {
    const recorded: RecordActionByPlayfabInput[] = []
    const result = await executeRecipe(action, { admin, player, gameServer, serverName: gameServer.name },
      { executeProfileRecipe: async payload => {
        const prepared = prepareAction(payload.recipe, payload.target, payload.context)
        assert.equal(prepared.commands[0].hours, 72)
        assert.equal(prepared.commands[1].message, `Ban 72`)
        return { prepared, result: sent === 2 ? successResult(sent) : failedResult(sent) }
      } }, async input => { recorded.push(input) }, undefined,
      async (_playfabId, _serverId, commands) => commands.map(item => item.commandType === `incremental_ban`
        ? { ...item, commandType: `ban`, durationHours: 72 } : item))
    assert.equal(result.ok, sent === 2)
    assert.deepEqual(recorded.map(item => [item.actionType, item.duration]), sent ? [[`ban`, 72]] : [])
  }
})

test(`missing incremental history prevents local native execution`, async () => {
  const action = { ...moderationAction, commands: [{ ...moderationAction.commands[1], commandType: `incremental_ban` as const }] }
  const result = await executeRecipe(action, { admin, player, gameServer, serverName: gameServer.name },
    { executeProfileRecipe: async () => { assert.fail(`No execution without a resolved ban`) } }, async () => {}, undefined,
    async () => { throw new Error(`History unavailable`) })
  assert.equal(result.ok, false)
  assert.equal(result.sentCommands, 0)
})

test(`duplicate ban preflight blocks the entire recipe before Core submission and offense recording`, async () => {
  let checked = false
  const result = await executeRecipe(moderationAction, { admin, player, gameServer, serverName: gameServer.name },
    { executeProfileRecipe: async () => { assert.fail(`Duplicate must not reach Core`) } },
    async () => { assert.fail(`Duplicate must not create an offense`) }, undefined,
    async () => { checked = true; throw new Error(`Duplicate active ban`) })
  assert.equal(checked, true)
  assert.equal(result.ok, false)
  assert.equal(result.sentCommands, 0)
})

test(`ban records use the same default one-hour duration as command preparation and preflight`, async () => {
  const recorded: RecordActionByPlayfabInput[] = []
  const action = { ...moderationAction, commands: [{ commandType: `ban` as const, sortOrder: 0, delayMs: 0, message: `Ban`, offenseType: `ffa` as const }] }
  await executeProfileAction(action, { admin, player, gameServer, serverName: gameServer.name },
    { executeBatch: async () => successResult(1) }, async input => { recorded.push(input) })
  assert.equal(recorded[0]?.duration, 1)
})

test(`unban never calls the duplicate-ban preflight`, async () => {
  const action = { ...moderationAction, commands: [{ commandType: `unban` as const, sortOrder: 0, delayMs: 0, message: `` }] }
  const result = await executeRecipe(action, { admin, player, playerId: 8, gameServer, serverName: gameServer.name },
    { executeProfileRecipe: async payload => ({ result: successResult(4), prepared: prepareAction(payload.recipe, payload.target, payload.context) }) },
    async () => {}, { validate: async () => {}, record: async () => {} },
    async () => { assert.fail(`Unban is exempt`) })
  assert.equal(result.ok, true)
})

test(`in-flight duplicate bans are blocked while distinct bans remain executable`, async () => {
  const gate = new EventEmitter()
  const checking = once(gate, `checking`)
  let sent = 0
  const context = { admin, player, gameServer, serverName: gameServer.name }
  const core = { executeProfileRecipe: async (payload: Parameters<ChivCoreApi[`executeProfileRecipe`]>[0]) => {
    sent++
    const prepared = prepareAction(payload.recipe, payload.target, payload.context)
    return { result: successResult(prepared.nativeCount), prepared }
  } }
  const first = executeRecipe(moderationAction, context, core, async () => {}, undefined,
    async () => { gate.emit(`checking`); await once(gate, `release`) })
  await checking
  try {
    const duplicate = await executeRecipe(moderationAction, context, core, async () => {}, undefined, async () => {})
    assert.equal(duplicate.sentCommands, 0)
    assert.equal(sent, 0)
    const distinct = { ...moderationAction, commands: moderationAction.commands.map(command => ({ ...command, durationHours: 48 })) }
    assert.equal((await executeRecipe(distinct, context, core, async () => {}, undefined, async () => {})).ok, true)
  } finally { gate.emit(`release`) }
  assert.equal((await first).ok, true)
  assert.equal(sent, 2)
})

test(`incremental and fixed bans cannot bypass each other's in-flight guard`, async () => {
  const fixed = { ...moderationAction, commands: [moderationAction.commands[1]] }
  const incremental = { ...fixed, commands: [{ ...fixed.commands[0], commandType: `incremental_ban` as const,
    incrementalBan: { windowDays: null, offenseTypes: null, stages: [{ banCount: 1, durationHours: 24 }] } }] }
  for (const [firstAction, secondAction] of [[incremental, fixed], [fixed, incremental]]) {
    const gate = new EventEmitter()
    const checking = once(gate, `checking`)
    const context = { admin, player, gameServer, serverName: gameServer.name }
    const core = { executeProfileRecipe: async (payload: Parameters<ChivCoreApi[`executeProfileRecipe`]>[0]) => {
      const prepared = prepareAction(payload.recipe, payload.target, payload.context)
      return { result: successResult(prepared.nativeCount), prepared }
    } }
    const first = executeRecipe(firstAction, context, core, async () => {}, undefined, async (_player, _server, commands) => {
      gate.emit(`checking`)
      await once(gate, `release`)
      return commands.map(command => ({ ...command, commandType: `ban`, durationHours: 24 }))
    })
    await checking
    try {
      const second = await executeRecipe(secondAction, context, core, async () => {}, undefined,
        async (_player, _server, commands) => commands.map(command => ({ ...command, commandType: `ban`, durationHours: 24 })))
      assert.equal(second.sentCommands, 0)
    } finally { gate.emit(`release`); await first }
  }
})


test(`configured unban removes the offense only after the full recipe completes`, async () => {
  const action = { ...moderationAction, commands: [
    { commandType: `unban` as const, sortOrder: 0, delayMs: 25, message: `Cleared` },
    { commandType: `server_message` as const, sortOrder: 1, delayMs: 40, message: `Appeal accepted` },
  ] }
  for (const completed of [false, true]) {
    const recorded: unknown[] = []
    const result = await executeRecipe(action, { admin, player, playerId: 8, relatedActionId: 6, removeOffense: true, gameServer, serverName: gameServer.name },
      { executeProfileRecipe: async request => ({ prepared: prepareAction(request.recipe, request.target, request.context),
        result: completed ? successResult(5) : failedResult(4) }) } as Pick<ChivCoreApi, `executeProfileRecipe`>,
      async () => {}, { validate: async () => {}, record: async (_input, related) => { recorded.push(related) } })
    assert.equal(result.ok, completed)
    assert.deepEqual(recorded, [{ playerId: 8, actionId: 6, ...(completed ? { removeOffense: true } : {}) }])
  }
})
