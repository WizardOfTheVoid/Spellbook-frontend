import assert from 'node:assert/strict'
import test from 'node:test'
import { itemPresentation } from './itemPresentation'

test(`normalizes Unreal references without losing the original path`, () => {
  const raw = `/Game/Inventory/Weapons/MeleeWeapons/Weapon_Messer.Default__Weapon_Messer_C`
  assert.deepEqual(itemPresentation(raw), { label: `Weapon · Messer`, tags: [`Melee`], raw })
  const classPath = `/Game/Inventory/Weapons/MeleeWeapons/Weapon_Messer.Weapon_Messer_C`
  assert.equal(itemPresentation(classPath).label, itemPresentation(raw).label)
})

test(`keeps variants and instance references distinct`, () => {
  const first = itemPresentation(`/Game/Maps/Duel.Duel.PersistentLevel.Weapon_LongSword_C_12`)
  const second = itemPresentation(`/Game/Maps/Duel.Duel.PersistentLevel.Weapon_LongSword_C_13`)
  assert.equal(first.label, `Weapon · Long Sword 12`)
  assert.notEqual(first.label, second.label)
  assert.deepEqual(first.tags, [])
})

test(`preserves unresolved, empty and plain labels`, () => {
  for (const value of [null, `Empty`, `Item 400`, `Throwing knife`, `Weapon_Messer`]) {
    assert.deepEqual(itemPresentation(value), { label: value ?? `—`, tags: [], raw: value })
  }
})

test(`formats unfamiliar asset names without guessing categories`, () => {
  const raw = `/Game/Experimental/BP_NewThing.BP_NewThing_C`
  assert.deepEqual(itemPresentation(raw), { label: `New Thing`, tags: [], raw })
  assert.equal(itemPresentation(`/Game/Experimental/Weapon`).label, `Weapon`)
})

test(`uses explicit folder categories and keeps siege inventory neutral`, () => {
  assert.deepEqual(itemPresentation(`/Game/Inventory/Weapons/Shields/Weapon_MediumShield.Weapon_MediumShield_C`).tags, [`Shield`])
  const siege = itemPresentation(`/Game/Inventory/SiegeEngines/Weapon_Horse.Weapon_Horse_C`)
  assert.equal(siege.label, `Inventory · Horse`)
  assert.deepEqual(siege.tags, [`Siege inventory`])
  assert.deepEqual(itemPresentation(`/Game/Interactables/Carryables/Carryable_Bandage.Carryable_Bandage_C`).tags, [])
})
