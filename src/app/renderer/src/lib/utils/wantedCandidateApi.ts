import { getServerApi, type CandidatePlayerListItem, type PlayerListQuery, type WantedCandidateDetail } from '$lib/core'
import { unwrap } from './apiResult'
import type { PlayerListMeta } from './playersApi'

export async function getWantedCandidates(query: PlayerListQuery = {}): Promise<{ players: CandidatePlayerListItem[], meta: PlayerListMeta }> {
  return unwrap(await getServerApi().candidates.list(query), `Candidates could not be loaded.`)
}

export async function getWantedCandidate(id: number): Promise<WantedCandidateDetail> {
  return unwrap(await getServerApi().candidates.get(id), `Candidate could not be loaded.`)
}

export async function decideWantedCandidate(id: number, revision: number, decision: `accept` | `reject`, note = ``): Promise<void> {
  unwrap(await getServerApi().candidates[decision](id, revision, note), `Candidate review failed.`)
}
