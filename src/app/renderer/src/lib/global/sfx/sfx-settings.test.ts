import assert from 'node:assert/strict'
import test from 'node:test'

type SettingsTarget = {
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
}

type SyncSfxSettings = (
  player: SettingsTarget,
  snapshot: {
    settings: {
      audioSfxEnabled: boolean
      audioSfxVolume: number
    }
  } | null
) => void

type RangeSfxVolume = (value: number, min: number, max: number) => number

async function loadSyncSfxSettings(): Promise<SyncSfxSettings> {
  const modulePath = './sfx-settings'
  const module = await import(modulePath).catch(() => ({}))
  const syncSfxSettings = Reflect.get(module, 'syncSfxSettings')

  assert.equal(
    typeof syncSfxSettings,
    'function',
    'syncSfxSettings should apply app settings to the UI SFX player'
  )

  return syncSfxSettings as SyncSfxSettings
}

async function loadRangeSfxVolume(): Promise<RangeSfxVolume> {
  const modulePath = './sfx-settings'
  const module = await import(modulePath)
  const rangeSfxVolume = Reflect.get(module, 'rangeSfxVolume')

  assert.equal(
    typeof rangeSfxVolume,
    'function',
    'rangeSfxVolume should scale slider sound by its position'
  )

  return rangeSfxVolume as RangeSfxVolume
}

test('applies saved enabled and volume settings to the UI SFX player', async () => {
  const syncSfxSettings = await loadSyncSfxSettings()
  const player = createSettingsTarget()

  syncSfxSettings(player, {
    settings: {
      audioSfxEnabled: false,
      audioSfxVolume: 0.25
    }
  })

  assert.equal(player.enabled, false)
  assert.equal(player.volume, 0.25)
})

test('uses enabled and 50% volume before settings load', async () => {
  const syncSfxSettings = await loadSyncSfxSettings()
  const player = createSettingsTarget(false, 1)

  syncSfxSettings(player, null)

  assert.equal(player.enabled, true)
  assert.equal(player.volume, 0.5)
})

test('scales range sound from 10% to its existing maximum volume', async () => {
  const rangeSfxVolume = await loadRangeSfxVolume()

  assert.ok(Math.abs(rangeSfxVolume(0, 0, 100) - 0.011) < Number.EPSILON)
  assert.ok(Math.abs(rangeSfxVolume(50, 0, 100) - 0.0605) < Number.EPSILON)
  assert.ok(Math.abs(rangeSfxVolume(100, 0, 100) - 0.11) < Number.EPSILON)
})

function createSettingsTarget(enabled = true, volume = 1) {
  return {
    enabled,
    volume,
    setEnabled(nextEnabled: boolean) {
      this.enabled = nextEnabled
    },
    setVolume(nextVolume: number) {
      this.volume = nextVolume
    }
  }
}
