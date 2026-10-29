export function getServerDisplayName(value: string | null | undefined): string {
	return value?.trim() || `Current game server`
}

export function getServerLabel(
	server: { name: string; displayName?: string | null } | null | undefined,
): string {
	return server?.displayName?.trim() || getServerDisplayName(server?.name);
}

export function getPlayerDisplayName(value: string | null | undefined): string {
	return typeof value === `string` && value.trim() ? value : "Unknown player";
}

export function getPlayerRowDisplayName(
	player: { name: string | null | undefined },
): string {
	return getPlayerDisplayName(player.name)
}
