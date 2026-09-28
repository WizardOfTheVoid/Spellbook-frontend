import { createServer } from 'node:net'

export async function reserveLoopbackPort(): Promise<number> {
  const server = createServer()
  const port = await new Promise<number>((resolve, reject) => {
    server.once(`error`, reject)
    server.listen(0, `127.0.0.1`, () => {
      const address = server.address()
      if (!address || typeof address === `string` || address.port <= 0) {
        reject(new Error(`Failed to reserve a loopback port`))
        return
      }
      resolve(address.port)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
  return port
}