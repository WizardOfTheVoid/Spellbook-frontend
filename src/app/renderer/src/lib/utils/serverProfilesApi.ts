import {
  getServerApi,
  type ActiveServerProfile,
  type ProfileOwner,
  type ProfileOwnerOption,
  type PlayerDbProfile,
  type RecordActionByPlayfabInput,
  type ServerProfileGraph,
  type ServerProfileGraphInput,
  type ServerProfileAssignment,
  type ServerProfileSummary,
} from "$lib/core";
import { unwrap } from "./apiResult";

export async function fetchProfileOwners(): Promise<ProfileOwnerOption[]> {
  return unwrap<ProfileOwnerOption[]>(await getServerApi().profileOwners(), "Profile owners request failed.");
}

export async function fetchPlayerProfile(playfabId: string): Promise<PlayerDbProfile> {
  return unwrap<PlayerDbProfile>(await getServerApi().playerProfileByPlayfab(playfabId), "Player profile request failed.");
}

export async function refreshPlayerProfile(playfabId: string): Promise<PlayerDbProfile> {
  return unwrap<PlayerDbProfile>(await getServerApi().refreshPlayerProfileByPlayfab(playfabId), "Player profile refresh failed.")
}

export async function fetchProfileSummaries(owner: ProfileOwner): Promise<ServerProfileSummary[]> {
  return unwrap<ServerProfileSummary[]>(await getServerApi().serverProfiles.list(owner), "Profiles request failed.");
}

export async function fetchProfileAssignments(): Promise<ServerProfileAssignment[]> {
  return unwrap<ServerProfileAssignment[]>(await getServerApi().serverProfiles.assignments(), "Profile assignments request failed.");
}

export async function fetchActiveServerProfile(externalId?: string | null): Promise<ActiveServerProfile> {
  return unwrap<ActiveServerProfile>(await getServerApi().serverProfiles.active(externalId), "Active profile request failed.");
}

export async function fetchServerProfile(owner: ProfileOwner, profileId: number): Promise<ServerProfileGraph> {
  return unwrap<ServerProfileGraph>(await getServerApi().serverProfiles.get(owner, profileId), "Profile request failed.");
}

export async function createServerProfile(owner: ProfileOwner, input: ServerProfileGraphInput): Promise<ServerProfileGraph> {
  return unwrap<ServerProfileGraph>(await getServerApi().serverProfiles.create(owner, input), "Profile create failed.");
}

export async function updateServerProfile(owner: ProfileOwner, profileId: number, input: ServerProfileGraphInput): Promise<ServerProfileGraph> {
  return unwrap<ServerProfileGraph>(await getServerApi().serverProfiles.update(owner, profileId, input), "Profile save failed.");
}

export async function resetServerProfile(owner: ProfileOwner, profileId: number): Promise<ServerProfileGraph> {
  return unwrap<ServerProfileGraph>(await getServerApi().serverProfiles.reset(owner, profileId), "Profile reset failed.");
}

export async function deleteServerProfile(owner: ProfileOwner, profileId: number): Promise<void> {
  await unwrap<unknown>(await getServerApi().serverProfiles.delete(owner, profileId), "Profile delete failed.");
}

export async function recordActionByPlayfab(input: RecordActionByPlayfabInput): Promise<unknown> {
  return unwrap<unknown>(await getServerApi().recordActionByPlayfab(input), "Player action record failed.");
}
