import assert from 'node:assert/strict'
import test from 'node:test'
import { AppSettingsService } from './app-settings-service'

test('uses 50% SFX volume for a fresh settings service', () => {
  const settings = new AppSettingsService().getSettings()

  assert.equal(settings.audioSfxVolume, 0.5)
})
