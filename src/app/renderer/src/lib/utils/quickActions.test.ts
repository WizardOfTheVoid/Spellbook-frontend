import assert from "node:assert/strict"
import test from "node:test"
import {
  quickActionTagItems,
  resolveQuickActionMessage,
  type QuickActionMessageKind
} from "./quickActions"
import { createSentinelModeStore, getAntiAfkControlState } from "../stores/sentinelModeStore"

const variables = [
  { key: `discord_url`, label: `Discord URL`, value: ``, sortOrder: 0 },
  { key: `adminsay_prefix`, label: `Adminsay prefix`, value: `Admin: `, sortOrder: 1 },
  { key: `serversay_prefix`, label: `Serversay prefix`, value: `[SB] `, sortOrder: 2 },
  { key: `rules_url`, label: `Rules URL`, value: `example.test/rules`, sortOrder: 3 },
  { key: `unassigned_link`, label: `Unassigned link`, value: `example.test/join`, sortOrder: 4 }
]
const definitions = [
  { key: `discord_url`, label: `Discord URL` },
  { key: `adminsay_prefix`, label: `Adminsay prefix` },
  { key: `rules_url`, label: `Rules URL` },
  { key: `profile_only`, label: `Profile only` }
]
const context = {
  admin: `JohnChivalry`,
  serverName: `Duel Server`,
  clanName: ``,
  clanTag: ``,
  variables
}

test(`unions profile definitions with current server variables`, () => {
  const items = quickActionTagItems(definitions, variables, context)
  assert.deepEqual(items.map(item => item.tag), [
    `[admin]`, `[server_name]`, `[clan_name]`, `[clan_tag]`,
    `[discord_url]`, `[adminsay_prefix]`, `[rules_url]`, `[profile_only]`, `[serversay_prefix]`, `[unassigned_link]`
  ])
})

test(`enables only tags with nonblank values and explains disabled tags`, () => {
  const items = quickActionTagItems(definitions, variables, context)
  const item = (tag: string) => items.find(candidate => candidate.tag === tag)
  const unavailable = `Not configured for this server. Configure it under Servers > Variables or type a fallback.`

  assert.equal(item(`[admin]`)?.disabled, false)
  assert.equal(item(`[server_name]`)?.disabled, false)
  assert.equal(item(`[rules_url]`)?.disabled, false)
  assert.deepEqual(item(`[discord_url]`), { tag: `[discord_url]`, tooltip: unavailable, disabled: true })
  assert.equal(item(`[profile_only]`)?.disabled, true)
  assert.equal(item(`[clan_name]`)?.disabled, true)
  assert.equal(item(`[clan_tag]`)?.disabled, true)
  assert.equal(item(`[unassigned_link]`)?.disabled, false)
})

test(`does not expose variables that shadow built-ins`, () => {
  const items = quickActionTagItems([], [
    { key: `admin`, label: `Legacy admin`, value: `Legacy` },
    { key: `rules_url`, label: `Rules URL`, value: `example.test/rules` },
    { key: `rules_url`, label: `Duplicate rules`, value: `duplicate.test` }
  ], { ...context, variables: [] })

  assert.deepEqual(items.map(item => item.tag), [
    `[admin]`, `[server_name]`, `[clan_name]`, `[clan_tag]`, `[rules_url]`
  ])
})

test(`preview and submission use the same single-pass fallback resolver`, () => {
  const draft = `[admin] on [server_name]: [missing|Our rules] [rules_url]`
  const preview = resolveQuickActionMessage(draft, context, `admin`)
  const submission = resolveQuickActionMessage(draft, context, `admin`)

  assert.equal(preview, `Admin: JohnChivalry on Duel Server: Our rules example.test/rules`)
  assert.equal(submission, preview)
})

test(`uses the Serversay prefix for server messages`, () => {
  assert.equal(resolveQuickActionMessage(`Restart soon`, context, `server`), `[SB] Restart soon`)
})

test(`Sentinel projection listens before hydration and rejects a stale getter`, async () => {
  const hydration = deferred<{ enabled: boolean }>()
  const calls: string[] = []
  let listener: ((state: { enabled: boolean }) => void) | null = null
  const store = createSentinelModeStore({
    sentinelState: async () => { calls.push(`get`); return hydration.promise },
    setSentinelEnabled: async enabled => ({ enabled }),
    onSentinelStateChange: callback => {
      calls.push(`listen`)
      listener = callback
      return () => calls.push(`remove`)
    }
  })
  const values: boolean[] = []
  const unsubscribe = store.subscribe(value => values.push(value))

  const publish = listener as ((state: { enabled: boolean }) => void) | null
  publish?.({ enabled: true })
  hydration.resolve({ enabled: false })
  await hydration.promise
  await new Promise(resolve => setImmediate(resolve))
  unsubscribe()

  assert.deepEqual(calls, [`listen`, `get`, `remove`])
  assert.deepEqual(values, [false, true])
})

test(`Sentinel projection hydrates Main state on remount and delegates changes`, async () => {
  const requested: boolean[] = []
  const store = createSentinelModeStore({
    sentinelState: async () => ({ enabled: true }),
    setSentinelEnabled: async enabled => { requested.push(enabled); return { enabled } },
    onSentinelStateChange: () => () => undefined
  })
  const values: boolean[] = []
  const unsubscribe = store.subscribe(value => values.push(value))
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(await store.setEnabled(false), { enabled: false })
  assert.deepEqual(requested, [false])
  assert.deepEqual(values, [false, true])
  unsubscribe()
})

test(`disables the Anti-AFK control and changes its tooltip during Sentinel mode`, () => {
  assert.deepEqual(getAntiAfkControlState(true, false), {
    disabled: true,
    tooltip: `Auto enabled when Sentinel Mode is active`,
  })
  assert.deepEqual(getAntiAfkControlState(false, false), {
    disabled: false,
    tooltip: `Prevents in-game auto kick`,
  })
})

const quickActionKinds: QuickActionMessageKind[] = [`admin`, `server`]
void quickActionKinds

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}
