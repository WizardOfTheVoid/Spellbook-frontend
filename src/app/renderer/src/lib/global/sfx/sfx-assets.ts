// Slug is the sound file name without its extension; new files in `$lib/sfx` register automatically.
const files = import.meta.glob<string>("../../sfx/*.{wav,mp3}", {
	eager: true,
	query: "?url",
	import: "default",
});

export const sfxUrls: Record<string, string> = Object.fromEntries(
	Object.entries(files).map(([path, url]) => [
		path.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
		url,
	]),
);

// Any string is accepted; unknown slugs warn at runtime instead of failing type-check.
export type SfxSlug = string;
