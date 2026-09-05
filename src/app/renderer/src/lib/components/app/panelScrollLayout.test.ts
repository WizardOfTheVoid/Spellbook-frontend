import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { compile } from "svelte/compiler"

const componentDirectory = dirname(fileURLToPath(import.meta.url))

const panels = [
	{
		name: "player profile",
		path: "../players/PlayerDetailPanel.svelte",
		rootClass: "player-detail",
		bodyClass: "player-detail__body",
	},
	{
		name: "health",
		path: "../health/HealthPanel.svelte",
		rootClass: "health-view",
		bodyClass: "health-view__body",
	},
	{
		name: "admin",
		path: "../admin/AdminPanel.svelte",
		rootClass: "admin-panel",
		bodyClass: "admin-root",
	},
	{
		name: "profiles",
		path: "../profiles/ProfilesPanel.svelte",
		rootClass: "profiles-view",
		bodyClass: "profile-screen",
	},
] as const

for (const panel of panels) {
	test(`${panel.name} keeps outer spacing outside its scroll area`, async () => {
		const css = await compileCss(panel.path)
		const rootRule = cssRule(panel.rootClass)
		const bodyRule = cssRule(panel.bodyClass)

		assert.match(css, rootRule("padding-top:var(--gutter-lg)"))
		assert.doesNotMatch(css, rootRule("padding:var(--panel-padding)"))
		assert.match(css, bodyRule("overflow:auto"))
		assert.match(
			css,
			bodyRule("padding:0var(--gutter-lg)var(--gutter-lg)"),
		)
	})
}

test("servers keeps outer spacing outside the archive scroll area", async () => {
	const panelCss = await compileCss("../servers/ServersPanel.svelte")
	const archiveCss = await compileCss("../servers/ServerArchive.svelte")

	assert.match(panelCss, cssRule("servers-view")("padding-top:var(--gutter-lg)"))
	assert.match(archiveCss, cssRule("server-archive__body")("overflow:hiddenauto"))
	assert.match(archiveCss, cssRule("server-archive__body")("padding:0var(--gutter-lg)"))
})

test("admin notification tests use the standard padded scroll area", async () => {
	const css = await compileCss("../admin/AdminPanel.svelte")
	const bodyRule = cssRule("admin-notification-tests")

	assert.match(css, bodyRule("overflow:auto"))
	assert.match(css, bodyRule("padding:0var(--gutter-lg)var(--gutter-lg)"))
})

test("dashboard scales the active sidebar from the single base width variable", async () => {
	const tokens = await readFile(resolve(componentDirectory, "../../../styles/_tokens.scss"), "utf8")
	const layout = await readFile(resolve(componentDirectory, "../../../styles/_layout.scss"), "utf8")
	const quickActions = await compileCss("QuickActions.svelte")

	assert.match(tokens, /--active-sidebar-width:\s*var\(--sidebar-width\)/)
	assert.match(tokens, /--sidebar-motion-duration:\s*650ms/)
	assert.match(layout, /grid-template-columns:[^;]*var\(--active-sidebar-width\)/)
	assert.match(layout, /grid-template-columns\s+var\(--sidebar-motion-duration\)\s+var\(--motion-ease\)/)
	assert.match(layout, /--active-sidebar-width:\s*calc\(var\(--sidebar-width\) \* 1\.5\)/)
	assert.match(layout, /--quick-actions-offset-x:\s*calc\(var\(--sidebar-width\) \* -0\.25\)/)
	assert.match(quickActions, /transform:translateX\(calc\(-50%\+var\(--quick-actions-offset-x\)\)\)/)
	assert.match(quickActions, /transformvar\(--sidebar-motion-duration\)var\(--motion-ease\)/)
})

async function compileCss(relativePath: string): Promise<string> {
	const path = resolve(componentDirectory, relativePath)
	const source = (await readFile(path, "utf8")).replace(
		`<style lang="scss">`,
		`<style>`,
	)
	const result = compile(source, { filename: path, generate: "server" })

	return (result.css?.code ?? "").replace(/\s+/g, "")
}

function cssRule(className: string): (declaration: string) => RegExp {
	return (declaration) =>
		new RegExp(`\\.${className}[^{}]*\\{[^{}]*${escapeRegExp(declaration)}`)
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
}
