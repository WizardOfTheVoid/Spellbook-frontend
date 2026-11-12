import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import type { FocusMonitor } from '../focus/focus-monitor'
import { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { AppHealthService } from './app-health-service'

test('adds server PlayFab health to the combined app result', async () => {
  const httpClient = createHttpClient()
  const focusMonitor = {
    capture: () => ({
      gameIsFocused: false,
      overlayIsFocused: true,
      checkedAt: '2026-07-17T00:00:00.000Z',
      coreReachable: true,
      coreStatus: 200
    })
  } as unknown as FocusMonitor
  const overlayWindow = {
    getCurrent: () => ({
      isDestroyed: () => false,
      isVisible: () => true
    })
  } as unknown as OverlayWindowController
  const service = new AppHealthService(httpClient, focusMonitor, overlayWindow, new RequestIdFactory('test'))

  const result = await service.getHealth()
  const envelope = result.data as {
    data: {
      playfab?: unknown
      tornBanner?: unknown
    }
  }

  assert.deepEqual(envelope.data.playfab, {
    running: true,
    latencyMs: 7,
    health: {
      running: true,
      status: 'ok'
    }
  })
  assert.deepEqual(envelope.data.tornBanner, {
    running: true,
    latencyMs: 7,
    health: {
      running: true,
      status: 'ok'
    }
  })
})

function createHttpClient(): HttpClient {
  const coreResult: CoreCallResult = {
    ok: true,
    status: 200,
    statusText: 'OK',
    data: {
      ok: true,
      data: {
        gameRunning: false,
        core: { running: true }
      }
    }
  }
  const serverResult: CoreCallResult = {
    ok: true,
    status: 200,
    statusText: 'OK',
    data: {
      ok: true,
      data: {
        server: { running: true },
        database: { running: true },
        playfab: { running: true, status: 'ok' },
        tornBanner: { running: true, status: 'ok' }
      }
    }
  }

  return {
    coreBaseUrl: 'http://127.0.0.1:48225',
    serverBaseUrl: 'http://127.0.0.1:48226/api/v1',
    callCore: async () => coreResult,
    getServer: async () => serverResult,
    timeCall: async (call: () => Promise<CoreCallResult>) => ({ result: await call(), latencyMs: 7 })
  } as unknown as HttpClient
}
