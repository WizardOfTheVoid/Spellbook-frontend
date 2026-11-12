import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadAppEnv } from './appEnv'

test('app env loads inline-commented Anti-AFK values without overriding the process', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'chiv-app-env-'))
  const appDirectory = join(workspace, 'src', 'app')
  const env: NodeJS.ProcessEnv = {
    ANTI_AFK_KEYS: 'ENTER:50'
  }

  try {
    await mkdir(appDirectory, { recursive: true })
    await writeFile(join(appDirectory, '.env'), [
      'ANTI_AFK_INTERVAL_SECONDS=45 # Seconds between sequences',
      'ANTI_AFK_KEYS="W:20,S:20" # Ordered key presses'
    ].join('\n'))

    loadAppEnv(env, workspace)

    assert.deepEqual(env, {
      ANTI_AFK_INTERVAL_SECONDS: '45',
      ANTI_AFK_KEYS: 'ENTER:50'
    })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('app env loads from packaged resources', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'chiv-app-workspace-'))
  const resources = await mkdtemp(join(tmpdir(), 'chiv-app-resources-'))
  const appDirectory = join(resources, 'app')
  const env: NodeJS.ProcessEnv = {}

  try {
    await mkdir(appDirectory, { recursive: true })
    await writeFile(join(appDirectory, '.env'), 'GAME_ACTIVITY_RECHECK_MS=550')

    loadAppEnv(env, workspace, resources)

    assert.equal(env.GAME_ACTIVITY_RECHECK_MS, '550')
  } finally {
    await Promise.all([
      rm(workspace, { recursive: true, force: true }),
      rm(resources, { recursive: true, force: true })
    ])
  }
})
