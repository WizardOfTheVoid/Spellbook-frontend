import { authState } from '$lib/auth/user'
import { checkEvidenceDuplicates, onEvidenceProgress, releaseEvidenceFiles, selectEvidenceFiles, uploadEvidence } from '$lib/utils/evidenceApi'
import { fetchPlayerProfile } from '$lib/utils/serverProfilesApi'
import { notifySuccess } from '$lib/notifications/notificationEvents'
import { createEvidenceSubmission } from './evidenceSubmission'

export const evidenceSubmission = createEvidenceSubmission({
  selectFiles: selectEvidenceFiles,
  releaseFiles: releaseEvidenceFiles,
  loadNames: async playfabId => (await fetchPlayerProfile(playfabId)).names.map(({ id, name }) => ({ id, name })),
  checkDuplicates: checkEvidenceDuplicates,
  upload: uploadEvidence,
  onProgress: onEvidenceProgress,
  onComplete: ({ player, results }) => notifySuccess(results.some(result => result.reviewStatus !== `wanted`)
    ? `Evidence sent for review.` : `Evidence submitted for ${player?.latestName || player?.playfabId}.`)
})

authState.subscribe(({ user }) => evidenceSubmission.syncUser(user?.isActive ? user.id : null))
