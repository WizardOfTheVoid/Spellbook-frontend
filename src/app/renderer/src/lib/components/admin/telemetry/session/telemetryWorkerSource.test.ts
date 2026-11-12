import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerStateSnapshot, TelemetryApi, TelemetryFrame } from '../../../../../../../shared/telemetry/telemetryTypes'
import { mapTelemetryEvent, resolveTelemetrySelection, TelemetryWorkerSource, type TelemetryReadRequest } from './telemetryWorkerSource'
import type { TelemetryPlayer } from './telemetryModels'
import { getMapContent } from '../map/mapGeometry'
import { selectDisplayPlayers } from './telemetryPlayerProjection'

test(`inventory type evidence exposes its class without becoming a spawn`, () => {
  const classPath = `/Game/Inventory/Weapons/MeleeWeapons/Weapon_Messer.Default__Weapon_Messer_C`
  const event = mapTelemetryEvent({
    sequence: 1, elapsedUs: 1, ordinal: 1, kind: `inventoryClassChanged`, entityId: `entity`,
    detail: `Observed inventory item type changed`, player: { values: { classPath } }
  }, [])
  assert.equal(event?.itemClass, classPath)
  assert.equal(event?.kind, `inventoryClassChanged`)
})

const player: PlayerStateSnapshot = {
  trackId: `track`, lifetimeId: `life`, entityId: `entity`, actorGuid: 2, active: true, elapsedUs: 10_000, sequence: 5
}
const frame: TelemetryFrame = {
  recordingId: `recording`, revision: 2, atUs: 20_000, committedHead: { sequence: 7, elapsedUs: 20_000 },
  cursor: { generation: `generation`, updateSequence: 2 }, entities: [], players: [player],
  coverage: {}, readView: { generation: `generation`, throughSequence: 7, atUs: 20_000 },
  capabilities: { schemaVersion: 3, projectionVersion: 1, players: true, metricHistory: true },
  summary: { activePlayers: 1, knownPlayers: 1, counts: { damage: 140, healing: 12 }, damageDealt: 1234 }
}
const request: TelemetryReadRequest = {
  recordingId: `recording`, workspaceId: `replay`, requestId: 1, revision: 2, generation: `generation`,
  atUs: 20_000, selectedPlayerId: `track`, tab: `overview`, filter: { query: ``, kind: `` }, page: 1, details: true
}

test(`observed accounts retain identity without borrowing pawn positions, paths or metric history`, async () => {
  const account: PlayerStateSnapshot = { ...player, observationKind: `account`, playFabId: `ABC`, name: `Observed name`, profile: { score: 4 } }
  const entity = { entityId: player.entityId, actorGuid: 2, channel: 1, kind: `pawn`, active: true, position: {
    entityId: player.entityId, elapsedUs: 10_000, ordinal: 1, sequence: 5, location: { x: 1, y: 2, z: 3 },
    rawLocation: { x: 1, y: 2, z: 3 }, source: `movement`, coordinateSpace: `world`, baseGuid: 0, reason: `observed`
  } }
  let historyReads = 0
  let trajectoryReads = 0
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({ ...frame, players: [account], entities: [entity] }),
    getMetricHistory: async () => { historyReads++; return { readView: frame.readView, series: [] } },
    getTrajectories: async () => { trajectoryReads++; return { readView: frame.readView, paths: [] } }
  } as unknown as TelemetryApi))
  const overview = await source.read(request)
  assert.equal(overview.players[0].name, `Observed name`)
  assert.equal(overview.players[0].observationKind, `account`)
  assert.equal(overview.players[0].position, null)
  assert.equal(historyReads, 0)
  const map = await source.read({ ...request, requestId: 2, tab: `map` })
  assert.equal(trajectoryReads, 0)
  assert.equal(getMapContent(map).players.length, 0)
  assert.equal(getMapContent(map).missing, 0)
  assert.deepEqual(selectDisplayPlayers([account, { ...player, observationKind: `pawn`, lifetimeId: `pawn` }]).map(value => value.lifetimeId), [`pawn`])
  assert.equal(selectDisplayPlayers([account, { ...player, trackId: `unlinked`, playFabId: `ABC`, observationKind: `pawn` }]).length, 2)
})

test(`unassigned component observations keep values without invented player attribution`, () => {
  for (const kind of [`componentStateObserved`, `accountStateObserved`, `inventoryClassChanged`]) {
    const event = mapTelemetryEvent({ sequence: 1, elapsedUs: 10, ordinal: 0, kind, detail: `Observed`,
      player: { values: { objectGuid: 12, health: 100 } } }, [])
    assert.equal(event?.kind, kind)
    assert.equal(event?.actorId, null)
    assert.equal(event?.targetId, null)
    assert.deepEqual(event?.contributorIds, [])
    assert.deepEqual(event?.values, { objectGuid: 12, health: 100 })
  }
})

test(`dependent history shares the frame read view and preserves null metrics and anonymous identity`, async () => {
  const inputs: unknown[] = []
  const api = {
    getFrame: async (input: unknown) => {
      inputs.push(input)
      return { ...frame, players: [player, { ...player, trackId: `other`, entityId: `otherEntity`,
        inventory: [{ index: 0, itemGuid: 0 }, { index: 1, itemGuid: null }, { index: 2, itemGuid: 400 }]
      }], entities: [{ entityId: `entity`, actorGuid: 2, channel: 1, kind: `pawn`, active: true, name: `Future name`, position: {
        entityId: `entity`, elapsedUs: 10_000, ordinal: 1, sequence: 5, location: { x: 1, y: 2, z: 3 },
        rawLocation: { x: 1, y: 2, z: 3 }, source: `movement`, coordinateSpace: `baseRelative`, baseGuid: 2, reason: `relative`
      } }] }
    },
    getMetricHistory: async (input: unknown) => {
      inputs.push(input)
      return { recordingId: `recording`, revision: 2, readView: frame.readView, truncated: false,
        series: [{ metric: `health`, points: [{ elapsedUs: 5_000, value: 75, lifetimeId: `life` }, { elapsedUs: 10_000, value: null, lifetimeId: `life` }] }] }
    }
  } as unknown as TelemetryApi
  const source = new TelemetryWorkerSource(() => api)
  const snapshot = await source.read(request)
  assert.equal(snapshot.players[0].name, null)
  assert.equal(snapshot.players[0].health, null)
  assert.equal(snapshot.players[0].position, null)
  assert.equal(snapshot.players[0].damageDealt, null)
  assert.equal(snapshot.players[0].inventoryKnown, false)
  assert.equal(snapshot.players[1].inventoryKnown, true)
  assert.deepEqual(snapshot.players[1].inventory.map(slot => slot.item), [`Empty`, null, `Item 400`])
  assert.deepEqual(snapshot.players[1].healthHistory, [])
  assert.deepEqual(snapshot.players[0].healthHistory.map(point => point.value), [75, null])
  assert.deepEqual(inputs[1], {
    workspaceId: `replay`, requestId: 1, recordingId: `recording`, trackId: `track`,
    fromUs: 0, toUs: 20_000, metrics: [`health`, `stamina`], maxPoints: 240, readView: frame.readView
  })
})

test(`a mismatched dependent view fails the entire cohort`, async () => {
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => frame,
    getMetricHistory: async () => ({ series: [], readView: { ...frame.readView, throughSequence: 8 } })
  } as unknown as TelemetryApi))
  await assert.rejects(source.read(request), /changed during this read/)
})

test(`server filtering and pagination never replace session totals with the loaded page`, async () => {
  let query: Record<string, unknown> = {}
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => frame,
    getEvents: async (input: Record<string, unknown>) => {
      query = input
      return { events: [], readView: frame.readView, matchingGroups: 230, nextSequence: 9 }
    }
  } as unknown as TelemetryApi))
  const snapshot = await source.read({ ...request, tab: `combat`, page: 2, eventOffset: 100, filter: { query: `target`, kind: `heal` } })
  assert.equal(query.offset, 100)
  assert.equal(query.limit, 100)
  assert.equal(query.search, `target`)
  assert.deepEqual(query.kinds, [`healing`])
  assert.equal(snapshot.eventPage?.total, 230)
  assert.equal(snapshot.eventPage?.counts.damage, 140)
  assert.equal(snapshot.totals?.damage, 1234)
})

test(`death keeps all contributors and attack notifications remain requests`, () => {
  const death = mapTelemetryEvent({
    sequence: 1, elapsedUs: 10, ordinal: 1, kind: `death`, detail: `Observed death`,
    player: { target: { trackId: `victim`, lifetimeId: null, entityId: null, actorGuid: 4 },
      contributors: [{ trackId: `a`, lifetimeId: null, entityId: null, actorGuid: 6 }, { trackId: `b`, lifetimeId: null, entityId: null, actorGuid: 8 }] }
  }, [])
  assert.equal(death?.actorId, null)
  assert.deepEqual(death?.contributorIds, [`a`, `b`])
  assert.equal(mapTelemetryEvent({ sequence: 2, elapsedUs: 11, ordinal: 2, kind: `attackRequested`, detail: `Request` }, [])?.kind, `attackStart`)
})

test(`trajectory budget applies to all visible paths together`, async () => {
  const second = { ...player, trackId: `second`, entityId: `secondEntity` }
  const points = Array.from({ length: 1800 }, (_, index) => ({
    entityId: `entity`, elapsedUs: index, ordinal: index, sequence: index,
    location: { x: index, y: 0, z: 0 }, rawLocation: { x: index, y: 0, z: 0 },
    source: `movement`, coordinateSpace: `world`, baseGuid: 0, reason: `observed`
  }))
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({ ...frame, players: [player, second] }),
    getTrajectories: async () => ({
      readView: frame.readView, paths: [
        { entityId: `entity`, coordinateSpace: `world`, points },
        { entityId: `secondEntity`, coordinateSpace: `world`, points }
      ]
    })
  } as unknown as TelemetryApi))
  const snapshot = await source.read({ ...request, tab: `map` })
  assert.equal(snapshot.paths.reduce((count, path) => count + path.points.length, 0), 2048)
})

test(`catalog is membership driven and current frame state overrides cached catalog`, async () => {
  let catalogCalls = 0
  let atUs = 20_000
  let rosterRevision = 3
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({
      ...frame, atUs, committedHead: { sequence: 7, elapsedUs: atUs },
      readView: { ...frame.readView, atUs }, coverage: { rosterRevision },
      players: [{ ...player, health: atUs / 1000 }]
    }),
    getPlayers: async () => {
      catalogCalls++
      return { players: [{ ...player, health: 1 }, { ...player, trackId: `departed`, lifetimeId: `departedLife`, active: false }],
        nextOffset: null, readView: { ...frame.readView, atUs } }
    }
  } as unknown as TelemetryApi))
  await source.read({ ...request, workspaceId: `live`, catalog: true, selectedPlayerId: null })
  atUs = 30_000
  const second = await source.read({ ...request, workspaceId: `live`, atUs, catalog: true, selectedPlayerId: null })
  assert.equal(catalogCalls, 1)
  assert.equal(second.players.find(row => row.id === `track`)?.health, 30)
  assert.equal(second.players.find(row => row.id === `departed`)?.present, false)
  rosterRevision = 4
  atUs = 40_000
  await source.read({ ...request, workspaceId: `live`, atUs, catalog: true, selectedPlayerId: null })
  assert.equal(catalogCalls, 2)
})

test(`an old item GUID never resolves against a future frame player`, () => {
  const event = mapTelemetryEvent({
    sequence: 1, ordinal: 1, elapsedUs: 1, kind: `itemObserved`, detail: `Observed`,
    item: { actorGuid: 4, ownerGuid: 2, classPath: `Item` }
  }, [{ ...player, elapsedUs: 10_000 }])
  assert.equal(event?.actorId, null)
  assert.deepEqual(event?.contributorIds, [])
})

test(`forward replay retains membership between catalog reads and rewind cannot reuse future catalog data`, async () => {
  let atUs = 20_000
  let catalogCalls = 0
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({ ...frame, atUs, readView: { ...frame.readView, atUs }, coverage: { rosterRevision: 3 } }),
    getPlayers: async () => {
      catalogCalls++
      return { players: [{ ...player, trackId: `departed`, lifetimeId: `departedLife`, active: false, health: atUs / 1000 }],
        nextOffset: null, readView: { ...frame.readView, atUs } }
    }
  } as unknown as TelemetryApi))
  await source.read({ ...request, selectedPlayerId: null, catalog: true })
  atUs = 30_000
  const forward = await source.read({ ...request, atUs, selectedPlayerId: null, details: false, catalog: false })
  assert.equal(forward.players.find(row => row.id === `departed`)?.health, 20)
  assert.equal(catalogCalls, 1)
  atUs = 10_000
  const rewind = await source.read({ ...request, atUs, selectedPlayerId: null, catalog: true })
  assert.equal(rewind.players.find(row => row.id === `departed`)?.health, 10)
  assert.equal(catalogCalls, 2)
})

test(`selection upgrades only from aliases visible at the cursor and rewinds to its anonymous anchor`, () => {
  const anonymous = { id: `anonymous`, aliases: [] } as unknown as TelemetryPlayer
  const known = { id: `known`, aliases: [`anonymous`] } as unknown as TelemetryPlayer
  assert.equal(resolveTelemetrySelection([anonymous], `anonymous`, `anonymous`)?.id, `anonymous`)
  assert.equal(resolveTelemetrySelection([known], `anonymous`, `anonymous`)?.id, `known`)
  assert.equal(resolveTelemetrySelection([anonymous], `known`, `anonymous`)?.id, `anonymous`)
  assert.equal(resolveTelemetrySelection([{ ...known, aliases: [] }], `anonymous`, `anonymous`), undefined)
})

test(`verified requests, decisions and item lifecycle values survive the adapter`, () => {
  for (const kind of [`abilityRequested`, `abilityInitiated`, `abilityInvocationCompleted`, `parryRequested`,
    `heavyAttackDecision`, `heldInputAdded`, `heldInputRemoved`, `itemReappeared`, `itemDormant`,
    `itemNoLongerRelevant`, `itemOwnerChanged`, `itemInstigatorChanged`, `objectObserved`]) {
    const event = mapTelemetryEvent({
      sequence: 1, elapsedUs: 10, ordinal: 1, kind, detail: `Recorded notification`, player: { values: { isHeavy: false } }
    }, [])
    assert.equal(event?.kind, kind)
    assert.equal(event?.values?.isHeavy, false)
  }
})

test(`two proven directional lifetimes display one incoming state without requiring a catalog read`, async () => {
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({ ...frame, players: [
      { ...player, direction: `fromServer`, health: 75 },
      { ...player, direction: `toServer`, entityId: `outgoing`, lifetimeId: `outgoing`, health: null, elapsedUs: 15_000 }
    ] })
  } as unknown as TelemetryApi))
  const snapshot = await source.read({ ...request, selectedPlayerId: null, details: false, catalog: false })
  assert.equal(snapshot.players.length, 1)
  assert.equal(snapshot.players[0].health, 75)
  assert.equal(snapshot.players[0].lifetimeId, `life`)
})

test(`track direction distinguishes local movement without inventing direction for older observations`, async () => {
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => ({ ...frame, players: [
      { ...player, direction: `fromServer` },
      { ...player, trackId: `local`, entityId: `local`, lifetimeId: `local`, direction: `toServer` },
      { ...player, trackId: `older`, entityId: `older`, lifetimeId: `older` }
    ] })
  } as unknown as TelemetryApi))
  const snapshot = await source.read({ ...request, selectedPlayerId: null, details: false, catalog: false })
  assert.deepEqual(snapshot.players.map(row => [row.id, row.direction]), [
    [`track`, `fromServer`], [`local`, `toServer`], [`older`, undefined]
  ])
})

test(`ended track contexts keep their state without inheriting a new context's position or ambiguous trail`, async () => {
  let afterClear = true
  const currentFrame = (): TelemetryFrame => ({
    ...frame, atUs: afterClear ? 20_000 : 5_000,
    readView: { ...frame.readView!, atUs: afterClear ? 20_000 : 5_000 },
    players: [{ ...player, trackId: afterClear ? `current` : `earlier`, health: afterClear ? 95 : 75 }],
    entities: [{ entityId: `entity`, actorGuid: 2, channel: 1, kind: `pawn`, active: true, position: {
      entityId: `entity`, elapsedUs: afterClear ? 15_000 : 4_000, ordinal: 1, sequence: 5,
      location: { x: 10, y: 20, z: 30 }, rawLocation: { x: 10, y: 20, z: 30 },
      source: `movement`, coordinateSpace: `world`, baseGuid: 0, reason: `observed`
    } }]
  })
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => currentFrame(),
    getPlayers: async () => ({
      players: afterClear ? [
        { ...player, trackId: `current`, health: 50 },
        { ...player, trackId: `earlier`, active: false, health: 75 }
      ] : [{ ...player, trackId: `earlier`, health: 75 }],
      nextOffset: null, readView: currentFrame().readView
    }),
    getTrajectories: async () => ({
      readView: currentFrame().readView,
      paths: [{ entityId: `entity`, coordinateSpace: `world`, points: [currentFrame().entities[0].position] }]
    }),
  } as unknown as TelemetryApi))
  const snapshot = await source.read({ ...request, tab: `map`, selectedPlayerId: null, catalog: true })
  assert.deepEqual(snapshot.players.map(row => [row.id, row.present, row.health]), [
    [`current`, true, 95], [`earlier`, false, 75]
  ])
  assert.deepEqual(snapshot.players.find(row => row.id === `current`)?.position, { x: 10, y: 20, z: 30 })
  assert.equal(snapshot.players.find(row => row.id === `earlier`)?.position, null)
  assert.deepEqual(snapshot.paths, [])
  afterClear = false
  const rewind = await source.read({ ...request, atUs: 5_000, tab: `map`, selectedPlayerId: null, catalog: true })
  assert.deepEqual(rewind.players.map(row => row.id), [`earlier`])
  assert.equal(rewind.paths.length, 1)
  assert.equal(rewind.paths[0].playerId, `earlier`)
})

test(`cancellation after a pending frame prevents dependent bridge calls`, async () => {
  let complete!: (value: TelemetryFrame) => void
  let historyReads = 0
  const source = new TelemetryWorkerSource(() => ({
    getFrame: async () => await new Promise<TelemetryFrame>(resolve => complete = resolve),
    cancelReads: async () => {},
    getMetricHistory: async () => { historyReads++ }
  } as unknown as TelemetryApi))
  const reading = source.read(request)
  await source.cancel(request)
  complete(frame)
  await assert.rejects(reading, /cancelled/)
  assert.equal(historyReads, 0)
})
