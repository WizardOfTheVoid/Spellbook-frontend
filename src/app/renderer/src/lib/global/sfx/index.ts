import { bindUISFX, createUISFX } from "uisfx"
import { settingsSnapshot } from "$lib/settings/settings-store"
import { SfxPlayer } from "./sfx-player"
import { syncSfxSettings } from "./sfx-settings"
import type { SfxSlug } from "./sfx-assets"
import { playDefaultButtonSfx } from "./delegatedSfx"

const customPlayer = new SfxPlayer()

customPlayer.preload()

export const SFX = createUISFX({
	pack: "minimal",
	volume: 0.5
})

/** `volume` is a fraction of the global custom SFX volume. */
export function playCustomSFX(slug: SfxSlug, volume = 1): void {
	customPlayer.play(slug, volume)
}

export function stopCustomSFX(slug: SfxSlug): void {
	customPlayer.stop(slug)
}

export const SFXCustom = {
	play: playCustomSFX,
	stop: stopCustomSFX,
	volume: () => customPlayer.getVolume(),
	enabled: () => customPlayer.isEnabled()
}

export type SfxCustomApi = typeof SFXCustom
export type { SfxSlug }

const unsubscribeSettings = settingsSnapshot.subscribe((snapshot) => {
	syncSfxSettings(SFX, snapshot)
	customPlayer.setGlobals(
		snapshot?.settings.audioSfxEnabled ?? true,
		snapshot?.settings.audioSfxVolume ?? 0.5
	)
})

if (typeof window !== "undefined") {
	window.SFX = SFX
	window.SFXCustom = SFXCustom

	const binding = bindUISFX(document, { player: SFX })
	const unlock = (): void => {
		void SFX.unlock()
		document.removeEventListener("pointerdown", unlock, true)
		document.removeEventListener("keydown", unlock, true)
	}
	const handleDefaultButtonSfx = (event: MouseEvent): void => {
		playDefaultButtonSfx(
			event.target instanceof Element ? event.target : null,
			() => SFX.play(`press`)
		)
	}

	document.addEventListener("pointerdown", unlock, {
		capture: true,
		once: true
	})
	document.addEventListener("keydown", unlock, {
		capture: true,
		once: true
	})
	document.addEventListener("click", handleDefaultButtonSfx)

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			unsubscribeSettings()
			binding.unbind()
			void SFX.destroy()
			document.removeEventListener("pointerdown", unlock, true)
			document.removeEventListener("keydown", unlock, true)
			document.removeEventListener("click", handleDefaultButtonSfx)
		})
	}
}
