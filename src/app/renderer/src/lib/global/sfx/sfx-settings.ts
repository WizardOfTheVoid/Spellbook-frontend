type SfxSettingsTarget = {
	setEnabled: (enabled: boolean) => void
	setVolume: (volume: number) => void
}

type SfxSettingsSnapshot = {
	settings: {
		audioSfxEnabled: boolean
		audioSfxVolume: number
	}
} | null

const rangeSfxMaxVolume = 0.11

export function rangeSfxVolume(value: number, min: number, max: number): number {
	if (max <= min) return rangeSfxMaxVolume
	const progress = Math.min(1, Math.max(0, (value - min) / (max - min)))
	return rangeSfxMaxVolume * (0.1 + progress * 0.9)
}

export function syncSfxSettings(
	player: SfxSettingsTarget,
	snapshot: SfxSettingsSnapshot
): void {
	player.setEnabled(snapshot?.settings.audioSfxEnabled ?? true)
	player.setVolume(snapshot?.settings.audioSfxVolume ?? 0.5)
}
