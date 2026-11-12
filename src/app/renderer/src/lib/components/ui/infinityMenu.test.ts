import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"

type MenuItem = {
	name: string
	icon: string
	separator?: boolean
	subtitle?: string
	action?: () => void | Promise<void>
	toggle?: { checked: boolean, group?: string, onChange: (checked: boolean) => void | Promise<void> }
	disabled?: boolean
	children?: MenuItem[]
	loadChildren?: () => Promise<MenuItem[]>
	closeOnAction?: boolean
}

type MenuLevel = {
	placement?: `right` | `bottom` | `top` | `left`
	name: string
	icon: string
	subtitle?: string
	items: MenuItem[]
}

type Point = { x: number; y: number }
type Size = { width: number; height: number }

type InfinityMenuModule = {
	resolveInfinityMenuLevel: (
		root: MenuLevel,
		path: number[],
		loadedChildren?: Map<string, MenuItem[]>,
	) => MenuLevel | null
	loadInfinityMenuChildren: (
		item: MenuItem,
		retry: () => void | Promise<void>,
		onError?: (error: unknown) => void,
	) => Promise<MenuItem[]>
	positionInfinityMenu: (
		snapshot: {
			menu?: MenuLevel
			position: Point
			owner: HTMLElement | null
		},
		menuSize: Size,
		viewportSize: Size,
		visiblePosition?: Point,
	) => Point
	infinityMenuState: {
		subscribe: (
			run: (value: {
				id: number
				menu: MenuLevel
				position: Point
				owner: HTMLElement | null
				container: HTMLElement | null
			} | null) => void,
		) => () => void
	}
	openInfinityMenu: (
		menu: MenuLevel,
		position: Point,
		owner?: HTMLElement | null,
		playOpen?: () => void,
		container?: HTMLElement | null,
	) => void
	closeInfinityMenu: () => void
	toggleInfinityMenuItem: (item: MenuItem, checked: boolean) => Promise<boolean>
	selectInfinityMenuToggles: (items: MenuItem[], index: number, checked: boolean) => Map<number, boolean>
}

const rootMenu: MenuLevel = {
	name: `Samwise`,
	icon: `fa-user`,
	items: [
		{
			name: `Ban`,
			icon: `fa-ban`,
			children: [
				{
					name: `Hacking`,
					icon: `fa-bug`,
					children: [
						{
							name: `Permanent`,
							icon: `fa-infinity`,
						},
					],
				},
			],
		},
	],
}

test(`resolves menu states at any child depth`, async () => {
	const { resolveInfinityMenuLevel } = await loadInfinityMenu()

	assert.equal(resolveInfinityMenuLevel(rootMenu, [])?.name, `Samwise`)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [0])?.name, `Ban`)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [0, 0])?.name, `Hacking`)
	assert.equal(
		resolveInfinityMenuLevel(rootMenu, [0, 0, 0])?.name,
		`Permanent`,
	)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [1]), null)
})

test(`child menus use their option subtitle`, async () => {
	const { resolveInfinityMenuLevel } = await loadInfinityMenu()
	const menu = { ...rootMenu, subtitle: `Quick access`, items: [
		{ name: `Custom`, icon: `fa-gear`, subtitle: `Your saved views`, children: [
			{ name: `One`, icon: `fa-star` },
		] },
	] }

	assert.equal(resolveInfinityMenuLevel(menu, [])?.subtitle, `Quick access`)
	assert.equal(resolveInfinityMenuLevel(menu, [0])?.subtitle, `Your saved views`)
})

test(`toggle items change checked state without closing the menu`, async () => {
	const { openInfinityMenu, closeInfinityMenu, infinityMenuState, toggleInfinityMenuItem } = await loadInfinityMenu()
	assert.equal(typeof toggleInfinityMenuItem, `function`)
	let selected = false
	const item: MenuItem = {
		name: `Online`, icon: `fa-circle`,
		toggle: { checked: false, onChange: checked => { selected = checked } },
	}
	openInfinityMenu({ ...rootMenu, items: [item] }, { x: 20, y: 20 }, null, () => {})

	assert.equal(await toggleInfinityMenuItem(item, false), true)
	assert.equal(selected, true)
	assert.equal(get(infinityMenuState)?.menu.items[0], item)
	assert.equal(await toggleInfinityMenuItem(item, true), false)
	assert.equal(selected, false)
	assert.equal(get(infinityMenuState)?.menu.items[0], item)

	closeInfinityMenu()
})

test(`exclusive toggles keep one choice selected`, async () => {
	const { toggleInfinityMenuItem } = await loadInfinityMenu()
	const changes: boolean[] = []
	const item = { name: `Ascending`, icon: `fa-arrow-up`, toggle: { checked: true, group: `direction`, onChange: (checked: boolean) => { changes.push(checked) } } }
	assert.equal(await toggleInfinityMenuItem(item, true), true)
	assert.deepEqual(changes, [])
	assert.equal(await toggleInfinityMenuItem(item, false), true)
	assert.deepEqual(changes, [true])
})

test(`selecting a grouped toggle clears its selected peer`, async () => {
	const { selectInfinityMenuToggles } = await loadInfinityMenu()
	const items = [
		{ name: `Ascending`, icon: `fa-arrow-up`, toggle: { checked: true, group: `direction`, onChange: () => {} } },
		{ name: `Descending`, icon: `fa-arrow-down`, toggle: { checked: false, group: `direction`, onChange: () => {} } }
	]
	assert.deepEqual([...selectInfinityMenuToggles(items, 1, true)], [[0, false], [1, true]])
})

test(`resolves loaded async children at their cached path`, async () => {
	const { resolveInfinityMenuLevel } = await loadInfinityMenu()
	const loadedChildren = new Map<string, MenuItem[]>([[
		`0`,
		[{ name: `Ban: hacker`, icon: `fa-ban` }],
	]])

	assert.deepEqual(
		resolveInfinityMenuLevel(rootMenu, [0], loadedChildren)?.items,
		[{ name: `Ban: hacker`, icon: `fa-ban` }],
	)
})

test(`returns loaded async menu children`, async () => {
	const { loadInfinityMenuChildren } = await loadInfinityMenu()
	const children = [{ name: `Ban: hacker`, icon: `fa-ban`, action: () => {} }]

	const result = await loadInfinityMenuChildren({
		name: `Select offense`,
		icon: `fa-list`,
		loadChildren: async () => children,
	}, async () => {})

	assert.equal(result, children)
})

test(`returns a disabled empty state for an async menu without children`, async () => {
	const { loadInfinityMenuChildren } = await loadInfinityMenu()

	const result = await loadInfinityMenuChildren({
		name: `Select offense`,
		icon: `fa-list`,
		loadChildren: async () => [],
	}, async () => {})

	assert.deepEqual(result, [{
		name: `No offenses`,
		icon: `fa-circle-info`,
		disabled: true,
	}])
})

test(`returns a stay-open retry action and reports async child errors`, async () => {
	const { loadInfinityMenuChildren } = await loadInfinityMenu()
	const expectedError = new Error(`request failed`)
	const errors: unknown[] = []
	let retryCount = 0

	const result = await loadInfinityMenuChildren({
		name: `Select offense`,
		icon: `fa-list`,
		loadChildren: async () => { throw expectedError },
	}, () => { retryCount++ }, error => errors.push(error))

	assert.deepEqual(result.map(({ name, icon, disabled, closeOnAction }) => ({
		name,
		icon,
		disabled,
		closeOnAction,
	})), [{
		name: `Retry`,
		icon: `fa-rotate-right`,
		disabled: undefined,
		closeOnAction: false,
	}])
	await result[0]?.action?.()
	assert.equal(retryCount, 1)
	assert.deepEqual(errors, [expectedError])
})

test(`context menus use the pointer instead of their wide button owner`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	const owner = Object.assign(element({ left: 40, top: 100, right: 460, bottom: 150 }), { tagName: `BUTTON` })

	assert.deepEqual(positionInfinityMenu(
		{ position: { x: 140, y: 125 }, owner },
		{ width: 240, height: 200 },
		{ width: 500, height: 500 },
	), { x: 140, y: 125 })
})

test(`context menus clamp the pointer when the viewport has less room`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	assert.deepEqual(positionInfinityMenu(
		{ position: { x: 490, y: 480 }, owner: null },
		{ width: 180, height: 140 },
		{ width: 500, height: 500 },
	), { x: 308, y: 348 })
})

test(`explicit button dropdowns open below their owner`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	const owner = Object.assign(element({ left: 80, top: 50, right: 180, bottom: 90 }), { tagName: `BUTTON` })
	assert.deepEqual(positionInfinityMenu(
		{ menu: { ...rootMenu, placement: `bottom` }, position: { x: 80, y: 50 }, owner },
		{ width: 180, height: 140 },
		{ width: 500, height: 500 }
	), { x: 40, y: 94 })
})

test(`submenu loading and back preserve the visible origin after the root flipped`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	const snapshot = { menu: { ...rootMenu, placement: `bottom` as const }, position: { x: 100, y: 270 },
		owner: element({ left: 80, top: 250, right: 180, bottom: 290 }) }
	const viewport = { width: 500, height: 500 }
	let position = positionInfinityMenu(snapshot, { width: 180, height: 240 }, viewport)
	assert.deepEqual(position, { x: 184, y: 150 })

	for (const height of [80, 300, 240]) {
		position = positionInfinityMenu(snapshot, { width: 180, height }, viewport, position)
		assert.deepEqual(position, { x: 184, y: 150 })
	}
})

test(`a larger submenu moves only enough to fit and does not bounce back`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	const snapshot = { position: { x: 140, y: 300 }, owner: null }
	const viewport = { width: 500, height: 500 }
	const position = positionInfinityMenu(snapshot, { width: 280, height: 300 }, viewport, { x: 260, y: 300 })
	assert.deepEqual(position, { x: 208, y: 188 })
	assert.deepEqual(positionInfinityMenu(snapshot, { width: 180, height: 80 }, viewport, position), { x: 208, y: 188 })
})

test(`resize clamps the visible origin when the viewport shrinks`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	assert.deepEqual(positionInfinityMenu(
		{ position: { x: 400, y: 250 }, owner: null },
		{ width: 180, height: 200 },
		{ width: 400, height: 350 },
		{ x: 400, y: 250 },
	), { x: 208, y: 138 })
})

test(`separators cannot become child menu levels`, async () => {
	const { resolveInfinityMenuLevel } = await loadInfinityMenu()
	const menu = { ...rootMenu, items: [{ name: `Sort field`, icon: `fa-clock` }, { name: ``, icon: ``, separator: true }] }
	assert.equal(resolveInfinityMenuLevel(menu, [1]), null)
})

test(`uses each menu's preferred placement`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	for (const [placement, expected] of [
		[`right`, { x: 236, y: 180 }],
		[`bottom`, { x: 160, y: 244 }],
		[`top`, { x: 160, y: 124 }],
		[`left`, { x: 84, y: 180 }],
	] as const) {
		assert.deepEqual(positionInfinityMenu(
			{ menu: { ...rootMenu, placement }, position: { x: 220, y: 220 },
				owner: element({ left: 200, top: 200, right: 240, bottom: 240 }) },
			{ width: 120, height: 80 },
			{ width: 500, height: 500 },
		), expected)
	}
})

test(`opens and closes the singleton root menu state`, async () => {
	const {
		infinityMenuState,
		openInfinityMenu,
		closeInfinityMenu,
	} = await loadInfinityMenu()
	let current: Parameters<Parameters<typeof infinityMenuState.subscribe>[0]>[0]
	const owner = {} as HTMLElement
	let openCueCount = 0
	const unsubscribe = infinityMenuState.subscribe((value) => (current = value))

	openInfinityMenu(rootMenu, { x: 400, y: 250 }, owner, () => (openCueCount += 1))

	assert.equal(current!.menu.name, `Samwise`)
	assert.deepEqual(current!.position, { x: 400, y: 250 })
	assert.equal(current!.owner, owner)
	assert.equal(openCueCount, 1)

	closeInfinityMenu()

	assert.equal(current!, null)
	unsubscribe()
})

test(`closes the menu and suppresses the browser menu on outside right click`, async () => {
	const modulePath = `./infinityMenu`
	const module = await import(modulePath)
	const closeOnContextMenu = Reflect.get(module, `closeInfinityMenuOnContextMenu`)

	assert.equal(
		typeof closeOnContextMenu,
		`function`,
		`closeInfinityMenuOnContextMenu should be implemented`,
	)

	let current: unknown
	let prevented = false
	const unsubscribe = module.infinityMenuState.subscribe((value: unknown) => (current = value))
	module.openInfinityMenu(rootMenu, { x: 20, y: 20 })

	closeOnContextMenu({ preventDefault: () => (prevented = true) })

	assert.equal(current, null)
	assert.equal(prevented, true)
	unsubscribe()
})

test(`a modal menu destination does not carry over to the next ordinary menu`, async () => {
	const { infinityMenuState, openInfinityMenu, closeInfinityMenu } = await loadInfinityMenu()
	const container = {} as HTMLElement
	let current: Parameters<Parameters<typeof infinityMenuState.subscribe>[0]>[0]
	const unsubscribe = infinityMenuState.subscribe(value => current = value)

	openInfinityMenu(rootMenu, { x: 20, y: 20 }, null, () => {}, container)
	assert.equal(current!.container, container)
	openInfinityMenu(rootMenu, { x: 40, y: 40 }, null, () => {})
	assert.equal(current!.container, null)

	closeInfinityMenu()
	unsubscribe()
})

async function loadInfinityMenu(): Promise<InfinityMenuModule> {
	const modulePath = `./infinityMenu`
	const module = await import(modulePath).catch(() => ({}))
	const requiredExports = [
		`resolveInfinityMenuLevel`,
		`loadInfinityMenuChildren`,
		`positionInfinityMenu`,
		`openInfinityMenu`,
		`closeInfinityMenu`,
	]

	for (const name of requiredExports) {
		assert.equal(
			typeof Reflect.get(module, name),
			`function`,
			`${name} should be implemented`,
		)
	}

	assert.equal(
		typeof Reflect.get(module, `infinityMenuState`)?.subscribe,
		`function`,
		`infinityMenuState should expose the root menu state`,
	)

	return module as InfinityMenuModule
}

function element(values: Pick<DOMRect, `left` | `top` | `right` | `bottom`>): HTMLElement {
	const owner = {} as HTMLElement
	owner.getBoundingClientRect = () => ({
		...values,
		width: values.right - values.left,
		height: values.bottom - values.top,
	}) as DOMRect
	return owner
}
