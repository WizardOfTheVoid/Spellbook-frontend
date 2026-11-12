export function getEvidenceGalleryCount(loadedCount: number, currentTotal: number | null): number {
  return loadedCount < 200 ? loadedCount : Math.max(loadedCount, currentTotal ?? 0)
}
