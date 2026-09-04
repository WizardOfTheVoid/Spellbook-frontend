<script lang="ts">
	import logoUrl from "$lib/resources/logo.svg?url"
</script>

<main class="startup-overlay" aria-label="Loading SpellBook" role="status">
	<div class="startup-overlay__glow"></div>
	<div class="startup-overlay__brand">
		<div class="startup-overlay__mark">
			<span class="startup-overlay__spinner"></span>
			<img src={logoUrl} alt="" />
		</div>
		<strong>SpellBook</strong>
		<span>Preparing your admin tools…</span>
	</div>
	<small>by Magic Trashcan</small>
</main>

<style lang="scss">
	.startup-overlay { width: 100vw; height: 100vh; display: grid; place-items: center; position: relative; overflow: hidden; background: var(--color-dark-primary); }
	.startup-overlay__glow { position: absolute; width: min(60vw, 700px); aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgbaa(var(--color-accent-primary), 0.14), transparent 66%); filter: blur(24px); }
	.startup-overlay__brand { position: relative; display: grid; place-items: center; gap: var(--gutter-md); color: var(--color-light-primary); }
	.startup-overlay__brand > strong { font-size: var(--font-size-2xl); font-weight: var(--font-weight-medium); letter-spacing: 0.08em; }
	.startup-overlay__brand > span { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.startup-overlay__mark { position: relative; width: 112px; height: 112px; display: grid; place-items: center; }
	.startup-overlay__mark img { width: 58px; height: 58px; object-fit: contain; }
	.startup-overlay__spinner { position: absolute; inset: 0; border: 1px solid var(--color-dark-tertiary); border-top-color: var(--color-accent-primary); border-right-color: rgbaa(var(--color-accent-primary), 0.45); border-radius: 50%; animation: startup-spin 1.2s linear infinite; }
	.startup-overlay > small { position: absolute; bottom: var(--gutter-xl); color: var(--color-light-tertiary); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
	@keyframes startup-spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .startup-overlay__spinner { animation: none; } }
</style>
