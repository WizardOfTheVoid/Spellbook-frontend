export type HelpView = `welcome` | `onboarding` | `changelogs`
export type AutoHelpView = Exclude<HelpView, `onboarding`>

const helpListeners = new Set<(view: HelpView) => void>()

export function requestHelp(view: HelpView): void {
	for (const listener of helpListeners) listener(view)
}

export function onHelpRequested(listener: (view: HelpView) => void): () => void {
	helpListeners.add(listener)
	return () => { helpListeners.delete(listener) }
}

export type ChangelogRelease = {
	version: string
	notes: string[]
}

const welcomeKey = (userId: number) => `spellbook:help:welcome:${userId}`
const changelogKey = (userId: number, version: string) => `spellbook:help:changelog:${userId}:${version}`

export function nextAutoHelpView(
	storage: Storage,
	userId: number,
	version: string,
): AutoHelpView | null {
	try {
		if (storage.getItem(welcomeKey(userId)) !== `true`) return `welcome`
		return storage.getItem(changelogKey(userId, version)) === `true` ? null : `changelogs`
	} catch {
		return null
	}
}

export function markAutoHelpDisplayed(
	storage: Storage,
	userId: number,
	version: string,
	view: AutoHelpView,
): void {
	try {
		if (view === `welcome`) storage.setItem(welcomeKey(userId), `true`)
		storage.setItem(changelogKey(userId, version), `true`)
	} catch {
		// The notice remains eligible if this installation cannot persist local state.
	}
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
	const releases: ChangelogRelease[] = []
	let release: ChangelogRelease | null = null

	for (const line of markdown.split(/\r?\n/)) {
		const heading = line.match(/^##\s+(.+?)\s*$/)
		if (heading) {
			release = { version: heading[1], notes: [] }
			releases.push(release)
			continue
		}
		const note = line.match(/^\s*-\s+(.+)$/)
		if (release && note) release.notes.push(note[1])
	}

	return releases.reverse()
}
