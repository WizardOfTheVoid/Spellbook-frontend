import type { TelemetryPlayer } from '../session/telemetryModels'

export function playerObservationLabel(player: TelemetryPlayer) {
  if (player.observationKind === `account`) return player.present ? `Observed account` : `Observed account · Ended`
  if (player.direction === `toServer`) return `Local movement`
  return !player.present ? `Ended` : player.playFabId ? `Identified` : `ID pending`
}
