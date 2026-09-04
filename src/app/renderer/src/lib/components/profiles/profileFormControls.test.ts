import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const componentDirectory = dirname(fileURLToPath(import.meta.url))

test("Profiles uses shared form controls and keeps native buttons only for navigable rows", async () => {
	const source = await readFile(resolve(componentDirectory, "ProfilesPanel.svelte"), "utf8")

	assert.doesNotMatch(source, /<(?:input|select|textarea)\b/u)
	assert.equal(source.match(/<button\b/gu)?.length, 3)
	assert.match(source, /import Textarea from "\$lib\/components\/ui\/Textarea\.svelte"/u)
	assert.doesNotMatch(source, /rgba\(21, 40, 55, 0\.82\)/u)
})
