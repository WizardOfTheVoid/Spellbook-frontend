import type { ChivAuthApi, ChivCoreApi, ChivOverlayApi, ChivServerApi } from '$lib/core'
import type { SfxCustomApi } from '$lib/global/sfx'
import type { UISFXPlayer } from 'uisfx'
import type { DiagnosticsApi } from '../../shared/diagnosticLogs'

export {}

declare global {
  interface Window {
    chivCore: ChivCoreApi
    chivAuth: ChivAuthApi
    chivServer: ChivServerApi
    chivOverlay: ChivOverlayApi
    chivDiagnostics: DiagnosticsApi
    SFX: UISFXPlayer
    SFXCustom: SfxCustomApi
  }

  // eslint-disable-next-line no-var
  var SFX: UISFXPlayer
  // eslint-disable-next-line no-var
  var SFXCustom: SfxCustomApi

  namespace App {}
}
