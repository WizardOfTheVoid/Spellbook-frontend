export function formatRecordTime(us: number): string {
  const seconds = Math.max(0, us) / 1000000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, `0`)}`
}
