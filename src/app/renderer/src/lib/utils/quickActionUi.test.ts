import assert from "node:assert/strict"
import test from "node:test"
import {
	bindModalToOverlayVisibility,
  containModalTab,
  makeModalBackgroundInert,
  ModalStateCoordinator,
  mountModalEnvironment,
  nextQuickActionMessageKind
} from "./quickActionUi"

test(`clicking the active message action closes its composer`, () => {
  assert.equal(nextQuickActionMessageKind(`admin`, `admin`), null)
  assert.equal(nextQuickActionMessageKind(`server`, `server`), null)
  assert.equal(nextQuickActionMessageKind(`admin`, `server`), `server`)
})

test(`overlay hide and reopen discard the mounted composer boundary`, async () => {
	let visibilityChange: ((visible: boolean) => void) | null = null
	let unsubscribed = false
	let messageKind: `admin` | null = `admin`
	let closeDone = Promise.resolve()
	const applied: boolean[] = []
	const state = new ModalStateCoordinator(async open => {
		applied.push(open)
	})

	await state.set(true)
	const unsubscribe = bindModalToOverlayVisibility(
		callback => {
			visibilityChange = callback
			return () => { unsubscribed = true }
		},
		() => {
			messageKind = null
			closeDone = state.set(false)
			return closeDone
		}
	)

	assert.ok(visibilityChange)
	const emitVisibility = visibilityChange as unknown as (visible: boolean) => void
	emitVisibility(false)
	emitVisibility(true)
	await closeDone

	assert.equal(messageKind, null)
	assert.deepEqual(applied, [true, false])
	unsubscribe()
	assert.equal(unsubscribed, true)
})

test(`overlapping modal opens retain one open boundary state`, async () => {
  const boundary = controllableBoundary()
  const state = new ModalStateCoordinator(boundary.set)
  const first = state.set(true)
  const second = state.set(true)

  await flush()
  assert.deepEqual(boundary.calls, [true])

  boundary.resolveNext()
  await Promise.all([first, second])
  assert.deepEqual(boundary.calls, [true])
})

test(`close publishes false after an earlier open resolves late`, async () => {
  const boundary = controllableBoundary()
  const state = new ModalStateCoordinator(boundary.set)
  const opening = state.set(true)

  await flush()
  const closing = state.set(false)
  boundary.resolveNext()
  await flush()

  assert.deepEqual(boundary.calls, [true, false])
  boundary.resolveNext()
  await Promise.all([opening, closing])
  assert.equal(boundary.calls.at(-1), false)
})

test(`Tab wraps within the modal in both directions`, () => {
  const focused: string[] = []
  const first = focusable(`first`, focused)
  const middle = focusable(`middle`, focused)
  const last = focusable(`last`, focused)
  const dialog = {
    focus: () => focused.push(`dialog`),
    querySelectorAll: () => [first, middle, last]
  }
  let prevented = 0

  containModalTab({
    key: `Tab`,
    shiftKey: false,
    preventDefault: () => { prevented += 1 }
  } as KeyboardEvent, dialog as unknown as HTMLElement, last as unknown as Element)
  containModalTab({
    key: `Tab`,
    shiftKey: true,
    preventDefault: () => { prevented += 1 }
  } as KeyboardEvent, dialog as unknown as HTMLElement, first as unknown as Element)

  assert.deepEqual(focused, [`first`, `last`])
  assert.equal(prevented, 2)
})

test(`Tab wraps across persistent modal controls and the dialog`, () => {
  const focused: string[] = []
  const adminsay = focusable(`adminsay`, focused)
  const serversay = focusable(`serversay`, focused)
  const textarea = focusable(`textarea`, focused)
  const send = focusable(`send`, focused)
  const quickActions = {
    querySelectorAll: () => [adminsay, serversay]
  }
  const dialog = {
    querySelectorAll: () => [textarea, send]
  }
  let prevented = 0

  containModalTab({
    key: `Tab`,
    shiftKey: false,
    preventDefault: () => { prevented += 1 }
  } as KeyboardEvent, [quickActions, dialog] as unknown as HTMLElement[], send as unknown as Element)
  containModalTab({
    key: `Tab`,
    shiftKey: true,
    preventDefault: () => { prevented += 1 }
  } as KeyboardEvent, [quickActions, dialog] as unknown as HTMLElement[], adminsay as unknown as Element)

  assert.deepEqual(focused, [`adminsay`, `send`])
  assert.equal(prevented, 2)
})

test(`modal background inert state is restored exactly on cleanup`, () => {
  const body = element()
  const app = element()
  const notification = element()
  const row = element()
  const modal = element()
  const content = element(true)
  attach(body, app, notification)
  attach(app, row, modal, content)

  const restore = makeModalBackgroundInert(modal as unknown as HTMLElement)

  assert.equal(row.inert, true)
  assert.equal(content.inert, true)
  assert.equal(notification.inert, true)
  assert.equal(modal.inert, false)

  restore()
  assert.equal(row.inert, false)
  assert.equal(content.inert, true)
  assert.equal(notification.inert, false)
})

test(`persistent modal controls remain interactive while other background is inert`, () => {
  const body = element()
  const app = element()
  const quickActions = element()
  const modal = element()
  const content = element()
  attach(body, app)
  attach(app, quickActions, modal, content)

  const restore = makeModalBackgroundInert(
    modal as unknown as HTMLElement,
    [quickActions as unknown as HTMLElement]
  )

  assert.equal(quickActions.inert, false)
  assert.equal(content.inert, true)

  restore()
  assert.equal(quickActions.inert, false)
  assert.equal(content.inert, false)
})

test(`modal cleanup restores the connected opener after background state`, () => {
  const app = element()
  const opener = element()
  const modal = element()
  attach(app, opener, modal)
  const focusOrder: boolean[] = []
  const focusTarget = {
    isConnected: true,
    focus: () => focusOrder.push(opener.inert)
  }

  const cleanup = mountModalEnvironment(
    modal as unknown as HTMLElement,
    focusTarget as unknown as HTMLButtonElement
  )
  assert.equal(opener.inert, true)

  cleanup()
  assert.deepEqual(focusOrder, [false])
})

function controllableBoundary(): {
  calls: boolean[]
  set: (open: boolean) => Promise<void>
  resolveNext: () => void
} {
  const calls: boolean[] = []
  const pending: Array<() => void> = []

  return {
    calls,
    set: async (open) => {
      calls.push(open)
      await new Promise<void>((resolve) => pending.push(resolve))
    },
    resolveNext: () => pending.shift()?.()
  }
}

function focusable(name: string, focused: string[]): { focus: () => void } {
  return { focus: () => focused.push(name) }
}

type FakeElement = {
  inert: boolean
  parentElement: FakeElement | null
  children: FakeElement[]
}

function element(inert = false): FakeElement {
  return { inert, parentElement: null, children: [] }
}

function attach(parent: FakeElement, ...children: FakeElement[]): void {
  parent.children = children
  for (const child of children) child.parentElement = parent
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}
