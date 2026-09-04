import assert from 'node:assert/strict'
import test from 'node:test'
import { CoreRequestPayloadFactory } from './core-request-payload-factory'

const createFactory = (handle: Buffer) => new CoreRequestPayloadFactory(() => ({
  getNativeWindowHandle: () => handle
}))

test('serializes a four-byte native window handle', () => {
  const factory = createFactory(Buffer.from('cdab1200', 'hex'))
  const payload = {
    command: 'listplayers',
    metadata: { requestId: 'request-1' },
    restoreTarget: { processId: 0, windowHandle: 'caller-value' }
  }

  const result = factory.withRestoreTarget(payload)

  assert.equal(result.command, payload.command)
  assert.equal(result.metadata, payload.metadata)
  assert.deepEqual(result.restoreTarget, {
    processId: process.pid,
    windowHandle: '0x000000000012ABCD'
  })
})

test('serializes an eight-byte native window handle without losing precision', () => {
  const factory = createFactory(Buffer.from('1032547698badcfe', 'hex'))

  assert.equal(
    factory.withRestoreTarget({}).restoreTarget.windowHandle,
    '0xFEDCBA9876543210'
  )
})

test('fetches the overlay window for every payload', () => {
  const handles = [
    Buffer.from('cdab1200', 'hex'),
    Buffer.from('1032547698badcfe', 'hex')
  ]
  let providerCalls = 0
  const factory = new CoreRequestPayloadFactory(() => {
    const handle = handles[providerCalls]
    providerCalls += 1

    return { getNativeWindowHandle: () => handle }
  })

  assert.equal(factory.withRestoreTarget({}).restoreTarget.windowHandle, '0x000000000012ABCD')
  assert.equal(factory.withRestoreTarget({}).restoreTarget.windowHandle, '0xFEDCBA9876543210')
  assert.equal(providerCalls, 2)
})

test('rejects zero-valued native window handles', () => {
  assert.throws(() => createFactory(Buffer.alloc(4)).withRestoreTarget({}))
  assert.throws(() => createFactory(Buffer.alloc(8)).withRestoreTarget({}))
})

test('rejects native window handles that are not four or eight bytes', () => {
  assert.throws(() => createFactory(Buffer.alloc(3)).withRestoreTarget({}))
  assert.throws(() => createFactory(Buffer.alloc(9)).withRestoreTarget({}))
})
