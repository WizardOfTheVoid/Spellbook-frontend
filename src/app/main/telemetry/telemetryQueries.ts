import type {
  EventPage, MetricHistoryPage, PlayerPage, ReadView, TelemetryFrame, TrajectoryPage
} from '../../shared/telemetry/telemetryTypes'
import { isId, isRecord, isTime, isVec3, requireValue } from '../../shared/telemetry/telemetryValidation'
import type { TelemetryClient } from './telemetryClient'

const operations = new Set([`openRecording`, `getFrame`, `getEvents`, `getTrajectories`, `getPlayers`, `getMetricHistory`])
export const isTelemetryQuery = (operation: string) => operations.has(operation)
const reference = (value: unknown) => typeof value === `string` && value.length > 0 && value.length <= 256
const optionalReference = (value: unknown) => value === undefined || reference(value)
const boundedInteger = (value: unknown, min: number, max: number) => isTime(value) && value >= min && value <= max

function readView(value: unknown): ReadView | undefined {
  if (value === undefined) return undefined
  requireValue(isRecord(value) && isId(value.generation) && isTime(value.throughSequence) && isTime(value.atUs))
  return { generation: value.generation, throughSequence: value.throughSequence, atUs: value.atUs }
}

export async function queryTelemetry(client: TelemetryClient, operation: string, input: unknown, signal: AbortSignal) {
  const body = operation === `openRecording` ? { recordingId: input, atUs: 0 } : isRecord(input) ? input : {}
  requireValue(isId(body.recordingId))
  const path = `/recordings/${body.recordingId}`
  const view = readView(body.readView)
  const interval = () => requireValue(isTime(body.fromUs) && isTime(body.toUs) && body.toUs >= body.fromUs)
  const post = <T>(suffix: string, data: unknown) => client.call<T>(`${path}/${suffix}`, data, `POST`, 5000, signal)

  switch (operation) {
    case `openRecording`:
    case `getFrame`: {
      requireValue(isTime(body.atUs) && optionalReference(body.trackId))
      const query = new URLSearchParams({ atUs: String(body.atUs) })
      if (typeof body.trackId === `string`) query.set(`trackId`, body.trackId)
      const frame = await client.call<TelemetryFrame>(`${path}/frame?${query}`, undefined, `GET`, 5000, signal)
      requireValue(frame.recordingId === body.recordingId &&
        Array.isArray(frame.entities) && frame.entities.length <= 4096 &&
        frame.entities.every(entity => !entity.position || (isVec3(entity.position.location) && isVec3(entity.position.rawLocation))) &&
        (!frame.players || (Array.isArray(frame.players) && frame.players.length <= 4096)),
      `Invalid worker frame`)
      return frame
    }
    case `getEvents`:
      interval()
      requireValue(
        (body.limit === undefined || boundedInteger(body.limit, 1, 200)) &&
        (body.afterSequence === undefined || isTime(body.afterSequence)) &&
        (body.offset === undefined || boundedInteger(body.offset, 0, 1_000_000)) &&
        (body.groupItems === undefined || typeof body.groupItems === `boolean`) &&
        (body.newestFirst === undefined || typeof body.newestFirst === `boolean`) &&
        optionalReference(body.entityId) && optionalReference(body.trackId) &&
        (body.search === undefined || (typeof body.search === `string` && body.search.length <= 128)) &&
        (body.kinds === undefined || (Array.isArray(body.kinds) && body.kinds.length <= 32 &&
          body.kinds.every(value => typeof value === `string` && value.length <= 64)))
      )
      return post<EventPage>(`events`, {
        fromUs: body.fromUs, toUs: body.toUs, afterSequence: body.afterSequence, limit: body.limit,
        entityId: body.entityId, trackId: body.trackId, kinds: body.kinds, groupItems: body.groupItems,
        newestFirst: body.newestFirst, search: body.search, offset: body.offset, readView: view
      })
    case `getTrajectories`:
      interval()
      requireValue(Array.isArray(body.entityIds) && body.entityIds.length <= 64 &&
        body.entityIds.every(reference) && boundedInteger(body.maxPoints, 2, 10000))
      return post<TrajectoryPage>(`trajectories`, {
        fromUs: body.fromUs, toUs: body.toUs, entityIds: body.entityIds, maxPoints: body.maxPoints, readView: view
      })
    case `getPlayers`:
      requireValue(isTime(body.atUs) && (body.offset === undefined || boundedInteger(body.offset, 0, 1_000_000)) &&
        (body.limit === undefined || boundedInteger(body.limit, 1, 200)) && optionalReference(body.lifetimeId) &&
        (body.includeDeparted === undefined || typeof body.includeDeparted === `boolean`))
      return post<PlayerPage>(`players`, {
        atUs: body.atUs, offset: body.offset, limit: body.limit, lifetimeId: body.lifetimeId,
        includeDeparted: body.includeDeparted, readView: view
      })
    case `getMetricHistory`:
      interval()
      requireValue(reference(body.trackId) && boundedInteger(body.maxPoints, 8, 2048) &&
        (body.metrics === undefined || (Array.isArray(body.metrics) && body.metrics.length > 0 && body.metrics.length <= 2 &&
          body.metrics.every(value => [`health`, `stamina`].includes(value)))))
      return post<MetricHistoryPage>(`metrics`, {
        fromUs: body.fromUs, toUs: body.toUs, trackId: body.trackId,
        metrics: body.metrics, maxPoints: body.maxPoints, readView: view
      })
    default:
      throw new Error(`Unknown telemetry query`)
  }
}
