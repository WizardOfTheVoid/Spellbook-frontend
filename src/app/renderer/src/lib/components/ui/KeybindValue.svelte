<script lang="ts">
	import { settingsSnapshot } from "$lib/settings/settings-store";
	import {
		defaultKeybinds,
		keybindLabel,
		type KeybindName,
	} from "../../../../../shared/keybinds";

	export let name: KeybindName;
	export let styled = true;
	$: value = $settingsSnapshot?.settings[name] ?? defaultKeybinds[name];
</script>

<span class="keybind-value" class:styled>{keybindLabel(value)}</span>

<style lang="scss">
	.keybind-value.styled {
		--width: 15px;
		display: inline-block;
		position: relative;

		color: var(--text-muted);
		font-size: var(--font-size-md);
		line-height: calc(var(--font-size-md) * 1.75);
		font-weight: var(--font-weight-medium);
		text-align: center;

		padding: 0px calc(var(--width) / 2);
	}

	.styled {
		&:after {
			content: "";
			z-index: 0;
			position: absolute;
			border: 1px solid rgbaa(var(--color-dark-tertiary), 0.75);
			border-radius: 6px;
			padding: 10px calc(var(--width));
			left: calc(var(--width) * 0);
		}
	}
</style>
