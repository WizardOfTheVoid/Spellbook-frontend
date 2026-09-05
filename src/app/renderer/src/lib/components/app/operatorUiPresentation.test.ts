import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { compile } from "svelte/compiler"

const componentDirectory = dirname(fileURLToPath(import.meta.url))

test("single-select and multi-select share one scrolling menu height", async () => {
	const tokens = await readFile(resolve(componentDirectory, "../../../styles/_tokens.scss"), "utf8")
	const selectCss = await compileCss("../ui/Select.svelte")
	const multiSelectCss = await compileCss("../ui/MultiSelect.svelte")

	assert.match(tokens, /--select-menu-max-height:\s*240px/)
	assert.match(selectCss, cssRule("ui-select__popover")("max-height:var(--select-menu-max-height)"))
	assert.match(selectCss, cssRule("ui-select__popover")("overflow-y:auto"))
	assert.match(multiSelectCss, cssRule("ui-multi-select__options")("max-height:var(--select-menu-max-height)"))
})

test("Wanted archive and detail share the low-opacity red ambient layer", async () => {
	const archive = await readComponent("../players/WantedPanel.svelte")
	const detail = await readComponent("../players/WantedDetail.svelte")

	assert.match(archive, /import WantedAmbient from "\.\/WantedAmbient\.svelte"/)
	assert.match(archive, /<WantedAmbient\s*\/>/)
	assert.match(detail, /import WantedAmbient from "\.\/WantedAmbient\.svelte"/)
	assert.match(detail, /<WantedAmbient\s*\/>/)

	const ambientCss = await compileCss("../players/WantedAmbient.svelte")
	const ambientRule = cssRule("wanted-ambient")
	assert.match(ambientCss, ambientRule("position:absolute"))
	assert.match(ambientCss, ambientRule("opacity:0.1"))
	assert.match(ambientCss, ambientRule("mix-blend-mode:screen"))
	assert.match(ambientCss, ambientRule("pointer-events:none"))
})

test("Wanted detail sends Notes to the player page instead of rendering notes", async () => {
	const detail = await readComponent("../players/WantedDetail.svelte")
	const overlay = await readComponent("OverlayContent.svelte")

	assert.doesNotMatch(detail, /PlayerNotes/)
	assert.match(detail, /export let onOpenNotes: \(\) => void/)
	assert.match(detail, /label="Notes"[^>]*onClick=\{onOpenNotes\}/s)
	assert.match(overlay, /onOpenNotes=\{\(\) => onOpenPlayerNotes\(selectedPlayer!\)\}/)
})

test("inactive Wanted detail preserves the full player fallback and its context", async () => {
	const detail = await readComponent("../players/WantedDetail.svelte")
	const overlay = await readComponent("OverlayContent.svelte")

	assert.match(detail, /\{#if viewState\.inactive\}\s*<PlayerDetailPanel/s)
	assert.match(detail, /notice="This player is no longer wanted\."/)
	assert.match(detail, /\{serverExternalId\}[\s\S]*\{serverName\}[\s\S]*\{serverAddress\}/)
	assert.match(overlay, /name="wanted-player"[\s\S]*\{serverExternalId\}[\s\S]*\{serverName\}[\s\S]*\{serverAddress\}/)
})

test("tile suffixes keep visible separation from their title", async () => {
	const tileCss = await compileCss("../ui/Tile.svelte")

	assert.match(tileCss, cssRule("ui-tile__suffix")("margin-inline-start:0.25em"))
})

test("navigation renders the generated product version", async () => {
	const navigation = await readComponent("../navigation/NavRail.svelte")

	assert.match(navigation, /import \{ productVersion \} from ['"]@spellbook\/shared\/productVersion['"]/)
	assert.match(navigation, />v\{productVersion\}</)
	assert.doesNotMatch(navigation, />v\d+\.\d+(?:\.\d+)?</)
})

test(`update navigation uses a restrained green border`, async () => {
	const navigationCss = await compileCss(`../navigation/NavRail.svelte`)

	assert.match(
		navigationCss,
		cssRule(`update-button`)(`border-color:var(--color-accent-secondary)`),
	)
})

async function readComponent(relativePath: string): Promise<string> {
	return readFile(resolve(componentDirectory, relativePath), "utf8")
}

async function compileCss(relativePath: string): Promise<string> {
	const path = resolve(componentDirectory, relativePath)
	const source = (await readFile(path, "utf8")).replace(`<style lang="scss">`, `<style>`)
	const result = compile(source, { filename: path, generate: "server" })

	return (result.css?.code ?? "").replace(/\s+/g, "")
}

function cssRule(className: string): (declaration: string) => RegExp {
	return declaration => new RegExp(`\\.${className}[^{}]*\\{[^{}]*${escapeRegExp(declaration)}`)
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
}
