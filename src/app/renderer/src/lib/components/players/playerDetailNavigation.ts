export type PlayerDetailBackTarget = `notes` | `profile` | `parent`

export type PlayerNotesNavigationTarget<T> = {
	page: `players`
	player: T
	subpage: `notes`
}

export function playerNotesNavigationTarget<T>(player: T): PlayerNotesNavigationTarget<T> {
	return { page: `players`, player, subpage: `notes` }
}

export function playerDetailBackTarget(
	actionMode: boolean,
	hasSelectedAction: boolean,
	hasSelectedUser: boolean,
	notesMode: boolean,
): PlayerDetailBackTarget {
	if (notesMode && (hasSelectedAction || hasSelectedUser)) return `notes`
	return actionMode || hasSelectedAction || hasSelectedUser || notesMode ? `profile` : `parent`
}
