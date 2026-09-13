import assert from 'node:assert/strict'
import test from 'node:test'

type CelebrateElement = (
  element: { getBoundingClientRect(): DOMRect },
  viewport: { innerWidth: number, innerHeight: number },
  launch: (options: unknown) => unknown,
) => void

test(`launches the shared celebration from the center of its element`, async () => {
  const celebrateElement = await loadCelebrateElement()
  const launches: unknown[] = []
  celebrateElement(
    {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        width: 40,
        height: 60,
      }) as DOMRect,
    },
    { innerWidth: 1000, innerHeight: 800 },
    options => launches.push(options),
  )

  assert.deepEqual(launches, [{
    particleCount: 72,
    spread: 62,
    startVelocity: 28,
    colors: [`#5865f2`, `#ffffff`, `#57f287`],
    disableForReducedMotion: true,
    zIndex: 50,
    origin: { x: 0.12, y: 0.2875 },
  }])
})

async function loadCelebrateElement(): Promise<CelebrateElement> {
  const modulePath = `./celebrate`
  const module = await import(modulePath).catch(() => ({}))
  const celebrateElement = Reflect.get(module, `celebrateElement`)
  assert.equal(typeof celebrateElement, `function`)
  return celebrateElement as CelebrateElement
}
