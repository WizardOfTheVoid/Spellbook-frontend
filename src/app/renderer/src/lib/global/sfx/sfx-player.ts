import { sfxUrls, type SfxSlug } from "./sfx-assets";

export class SfxPlayer {
	private readonly elements = new Map<string, HTMLAudioElement>();
	private enabled = true;
	private masterVolume = 1;

	preload(): void {
		if (typeof Audio === "undefined") return;

		for (const [slug, url] of Object.entries(sfxUrls)) {
			if (this.elements.has(slug)) continue;

			const element = new Audio(url);
			element.preload = "auto";
			element.load();
			this.elements.set(slug, element);
		}
	}

	setGlobals(enabled: boolean, volume: number): void {
		this.enabled = enabled;
		this.masterVolume = clamp(volume);
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	getVolume(): number {
		return this.masterVolume;
	}

	play(slug: SfxSlug, volume = 1): void {
		if (!this.enabled) return;

		const element = this.elements.get(slug);
		if (!element) {
			this.warnMissing(slug);
			return;
		}

		element.volume = clamp(volume) * this.masterVolume;
		element.currentTime = 0;
		void element.play().catch(() => undefined);
	}

	stop(slug: SfxSlug): void {
		const element = this.elements.get(slug);
		if (!element) {
			this.warnMissing(slug);
			return;
		}

		element.pause();
		element.currentTime = 0;
	}

	private warnMissing(slug: string): void {
		console.warn(
			`SFX "${slug}" not found. Known slugs: ${Object.keys(sfxUrls).join(", ")}`,
		);
	}
}

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
