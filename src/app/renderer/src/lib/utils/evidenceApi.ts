import { getServerApi, type EvidenceComment, type EvidenceDuplicateCheck, type EvidenceItem, type EvidenceSelectedFile } from '$lib/core'
import { unwrap } from './apiResult'

export { cheatOptions } from '@spellbook/shared/evidencePresentation'

export async function selectEvidenceFiles(): Promise<EvidenceSelectedFile[]> {
  return getServerApi().evidence.select()
}

export async function releaseEvidenceFiles(ids: string[]): Promise<void> {
  if (ids.length) await getServerApi().evidence.release(ids)
}

export function onEvidenceProgress(callback: (progress: import('$lib/core').EvidenceUploadProgress) => void): () => void {
  return getServerApi().evidence.onProgress(callback)
}

export async function checkEvidenceDuplicates(originalByteSize: number, originalSha256: string): Promise<EvidenceDuplicateCheck> {
  return unwrap<EvidenceDuplicateCheck>(await getServerApi().evidence.checkDuplicates(originalByteSize, originalSha256), `Duplicate check failed.`)
}

export async function uploadEvidence(input: { fileId: string, playerId?: number, playfabId?: string, nicknameId: number | null, subtypes: string[] }): Promise<EvidenceItem> {
  return unwrap<EvidenceItem>(await getServerApi().evidence.upload(input), `Evidence upload failed.`)
}

export async function listEvidence(playerId: number): Promise<EvidenceItem[]> {
  return unwrap<EvidenceItem[]>(await getServerApi().evidence.list(playerId), `Evidence could not be loaded.`)
}

export async function getEvidence(id: number): Promise<EvidenceItem> {
  return unwrap<EvidenceItem>(await getServerApi().evidence.get(id), `Evidence could not be loaded.`)
}

export async function getLinkedEvidence(token: string): Promise<EvidenceItem> {
  return unwrap<EvidenceItem>(await getServerApi().evidence.byToken(token), `Evidence link could not be opened.`)
}

export async function updateEvidenceOffenses(id: number, offenseIds: number[]): Promise<{ offenseIds: number[] }> {
  return unwrap(await getServerApi().evidence.offenses(id, offenseIds), `Evidence offenses could not be saved.`)
}

export async function recordEvidenceView(id: number, sessionId: string, watchedMs: number): Promise<{ viewCount: number }> {
  return unwrap(await getServerApi().evidence.view(id, sessionId, watchedMs), `Evidence view could not be counted.`)
}

export async function listEvidenceComments(id: number): Promise<EvidenceComment[]> {
  return unwrap<EvidenceComment[]>(await getServerApi().evidence.comments(id), `Comments could not be loaded.`)
}

export async function addEvidenceComment(id: number, body: string, positionMs: number | null = null): Promise<EvidenceComment> {
  return unwrap<EvidenceComment>(await getServerApi().evidence.comment(id, body, positionMs), `Comment could not be added.`)
}

export async function deleteEvidence(id: number): Promise<void> {
  await unwrap(await getServerApi().evidence.delete(id), `Evidence could not be deleted.`)
}

export async function deleteEvidenceComment(id: number, commentId: number): Promise<void> {
  await unwrap(await getServerApi().evidence.deleteComment(id, commentId), `Comment could not be deleted.`)
}
