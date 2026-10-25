import type { PendingPlayerLink } from '@spellbook/shared/appLinks'

export type PlayerLinkPorts<Profile> = {
  ready(): boolean
  current(): Promise<PendingPlayerLink | null>
  fetch(playfabId: string): Promise<Profile>
  profileId(profile: Profile): string
  navigate(profile: Profile, sequence: number): Promise<boolean>
  acknowledge(sequence: number): Promise<boolean>
  invalid(message: string): void
}

export type PlayerLinkVisitPorts<Profile> = {
  ready(): boolean
  current(): Promise<PendingPlayerLink | null>
  canLeave(): Promise<boolean>
  visit(action: () => Promise<boolean>): Promise<boolean>
  open(profile: Profile): void
}

export async function visitPlayerLink<Profile>(
  profile: Profile,
  sequence: number,
  ports: PlayerLinkVisitPorts<Profile>
): Promise<boolean> {
  let opened = false
  await ports.visit(async () => {
    if (!await ports.canLeave()) return false
    const current = await ports.current()
    if (!ports.ready() || current?.sequence !== sequence) return false
    ports.open(profile)
    opened = true
    return true
  })
  return opened
}

export async function openPendingPlayerLink<Profile>(
  link: PendingPlayerLink,
  ports: PlayerLinkPorts<Profile>
): Promise<void> {
  if (!ports.ready()) return
  let settled = false
  try {
    const profile = await ports.fetch(link.playfabId)
    const current = await ports.current()
    if (!ports.ready() || current?.sequence !== link.sequence) return
    if (ports.profileId(profile) !== link.playfabId) throw new Error(`Player profile did not match the link`)
    const opened = await ports.navigate(profile, link.sequence)
    const afterVisit = await ports.current()
    if (!ports.ready() || afterVisit?.sequence !== link.sequence) return
    if (!opened) ports.invalid(`Player link was not opened.`)
    settled = true
  } catch {
    const current = await ports.current()
    if (ports.ready() && current?.sequence === link.sequence) {
      ports.invalid(`Player profile could not be opened.`)
      settled = true
    }
  } finally {
    if (settled && ports.ready()) await ports.acknowledge(link.sequence)
  }
}
