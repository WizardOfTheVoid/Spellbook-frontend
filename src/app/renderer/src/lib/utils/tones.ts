import type { Tone } from "$lib/types/tone";

const toneVariables: Record<Tone, string> = {
	default: "var(--color-light-primary)",
	bright: "var(--color-light-primary)",
	muted: "var(--color-text-secondary)",
	accent: "var(--color-accent-tertiary)",
	success: "var(--color-accent-secondary)",
	danger: "var(--color-accent-tertiary)",
	warning: "var(--color-accent-tertiary)",
	info: "var(--color-light-secondary)",
};

export function toneColor(tone: Tone = "default"): string {
	return toneVariables[tone] ?? toneVariables.default;
}

export function resolveToneColor(tone: Tone, color?: string | null): string {
	return color ?? toneColor(tone)
}

/** Inline style that exposes a tone to a component's scoped CSS as `--tone`. */
export function toneStyle(tone: Tone = "default"): string {
	return `--tone: ${toneColor(tone)};`;
}
