import assert from "node:assert/strict"
import test from "node:test"

type MenuItem = {
	name: string
	icon: string
	action?: () => void | Promise<void>
	disabled?: boolean
	children?: MenuItem[]
	loadChildren?: () => Promise<MenuItem[]>
	closeOnAction?: boolean
}

type MenuLevel = {
	name: string
	icon: string
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
			position: Point
			owner: HTMLElement | null
		},
		menuSize: Size,
		viewportSize: Size,
	) => Point
	infinityMenuState: {
		subscribe: (
			run: (value: {
				id: number
				menu: MenuLevel
				position: Point
				owner: HTMLElement | null
			} | null) => void,
		) => () => void
	}
	openInfinityMenu: (
		menu: MenuLevel,
		position: Point,
		owner?: HTMLElement | null,
		playOpen?: () => void,
	) => void
	closeInfinityMenu: () => void
}

const rootMenu: MenuLevel = {
	name: `Alice`,
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

	assert.equal(resolveInfinityMenuLevel(rootMenu, [])?.name, `Alice`)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [0])?.name, `Ban`)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [0, 0])?.name, `Hacking`)
	assert.equal(
		resolveInfinityMenuLevel(rootMenu, [0, 0, 0])?.name,
		`Permanent`,
	)
	assert.equal(resolveInfinityMenuLevel(rootMenu, [1]), null)
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

test(`positions the menu beyond its owner with the larger menu gap`, async () => {
	const { positionInfinityMenu } = await loadInfinityMenu()
	const owner = element({ left: 40, top: 100, right: 90, bottom: 150 })

	assert.deepEqual(positionInfinityMenu(
		{ position: { x: 24, y: 680 }, owner },
		{ width: 240, height: 200 },
		{ width: 500, height: 500 },
	), { x: 106, y: 25 })
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

	assert.equal(current!.menu.name, `Alice`)
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
