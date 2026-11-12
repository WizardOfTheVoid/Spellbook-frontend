export async function dispatchRequest<T extends { gameServerId: number, observedAt: string }>(
  snapshot: T | null,
  gameServerId: number,
  local: (snapshot: T) => Promise<void>,
  remote: () => Promise<void>
) {
  if (snapshot?.gameServerId === gameServerId && Date.now() - Date.parse(snapshot.observedAt) <= 15000) {
    await local(snapshot)
  } else {
    await remote()
  }
}
