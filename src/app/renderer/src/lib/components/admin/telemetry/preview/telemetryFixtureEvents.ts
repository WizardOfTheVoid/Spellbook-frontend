import type { TelemetryEvent } from '../session/telemetryModels'

function event(id: string, timeMs: number, kind: TelemetryEvent[`kind`], values: Partial<TelemetryEvent>): TelemetryEvent {
  return {
    id, timeMs, kind, actorId: null, targetId: null, contributorIds: [],
    itemClass: null, relationship: null, amount: null, count: 1, detail: ``, ...values
  }
}

export const fixtureEvents: TelemetryEvent[] = [
  event(`attack-1`, 2_000, `attackStart`, { actorId: `p1`, detail: `Slash windup` }),
  event(`attack-2`, 3_000, `attackCancel`, { actorId: `p1`, detail: `Attack cancelled before release` }),
  event(`damage-1`, 4_000, `damage`, { actorId: `p8`, targetId: `p4`, amount: 25, detail: `Melee damage` }),
  event(`damage-2`, 6_000, `damage`, { actorId: `p1`, targetId: `p3`, amount: 35, detail: `Slash damage` }),
  event(`heal-1`, 8_000, `heal`, { actorId: `p4`, targetId: `p4`, amount: 12, detail: `Healing observed` }),
  event(`damage-3`, 9_000, `damage`, { actorId: `p2`, targetId: `p3`, amount: 40, detail: `Projectile damage` }),
  event(`damage-4`, 12_000, `damage`, { actorId: `p1`, targetId: `p3`, amount: 50, detail: `Heavy slash damage` }),
  event(`death-1`, 12_000, `death`, {
    targetId: `p3`, contributorIds: [`p1`, `p2`], detail: `Death observed; multiple damage contributors`
  }),
  ...Array.from({ length: 100 }, (_, index) => event(`arrow-${index + 1}`, 20_000 + index * 10, `itemObserved`, {
    actorId: `p1`, itemClass: `BP_Arrow_C`, relationship: `owner`, detail: `Item observed with an owner reference`
  })),
  event(`axe-observed`, 20_300, `itemObserved`, {
    actorId: `p1`, itemClass: `BP_ThrowingAxe_C`, relationship: `owner`, detail: `Item observed with an owner reference`
  }),
  event(`arrow-instigator`, 20_500, `itemObserved`, {
    actorId: `p1`, itemClass: `BP_Arrow_C`, relationship: `instigator`, detail: `Item observed with an instigator reference`
  }),
  event(`arrow-destroyed`, 20_800, `itemDestroyed`, {
    actorId: `p1`, itemClass: `BP_Arrow_C`, relationship: `owner`, detail: `Item removal observed`
  }),
  event(`inventory-1`, 21_000, `inventoryChanged`, {
    actorId: `p2`, itemClass: `BP_ThrowingAxe_C`, relationship: `owner`, detail: `Throwable slot became empty`
  }),
  event(`disconnect-1`, 24_000, `disconnect`, { targetId: `p6`, detail: `Player no longer observed in the session` }),
  event(`inventory-2`, 26_000, `inventoryChanged`, {
    actorId: `p1`, itemClass: `BP_PoleAxe_C`, relationship: `owner`, detail: `Primary inventory slot contains a poleaxe`
  }),
  event(`attack-3`, 30_000, `attackStart`, { actorId: `p2`, detail: `Overhead windup` }),
  event(`damage-5`, 33_000, `damage`, { actorId: `p2`, targetId: `p1`, amount: 40, detail: `Overhead damage` }),
  event(`damage-6`, 36_000, `damage`, { actorId: `p7`, targetId: `p5`, amount: 70, detail: `Heavy melee damage` }),
  event(`damage-7`, 42_000, `damage`, { actorId: `p8`, targetId: `p5`, amount: 80, detail: `Melee damage` }),
  event(`death-2`, 42_000, `death`, {
    targetId: `p5`, contributorIds: [`p7`, `p8`], detail: `Death observed; multiple damage contributors`
  }),
  event(`attack-4`, 55_000, `attackStart`, { actorId: `p3`, detail: `Stab windup` }),
  event(`attack-5`, 56_000, `attackCancel`, { actorId: `p3`, detail: `Attack cancelled before release` }),
  event(`damage-8`, 61_000, `damage`, { actorId: `p8`, targetId: `p1`, amount: 28, detail: `Projectile damage` }),
  event(`heal-2`, 66_000, `heal`, { actorId: `p1`, targetId: `p1`, amount: 15, detail: `Healing observed` }),
  event(`damage-9`, 77_000, `damage`, { actorId: `p4`, targetId: `p2`, amount: 32, detail: `Melee damage` }),
  event(`heal-3`, 82_000, `heal`, { actorId: `p2`, targetId: `p2`, amount: 20, detail: `Healing observed` })
].sort((left, right) => left.timeMs - right.timeMs)
