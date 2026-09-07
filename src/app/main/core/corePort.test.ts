import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import test from 'node:test'
import { reserveLoopbackPort } from './corePort'

test(`reserves a loopback port and closes its temporary listener`, async () => {
  const port = await reserveLoopbackPort()
  const server = createServer()

  await new Promise<void>((resolve, reject) => {
    server.once(`error`, reject)
    server.listen(port, `127.0.0.1`, resolve)
  })

  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
})