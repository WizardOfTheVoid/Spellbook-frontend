import { once } from 'node:events'
import type { Server } from 'node:net'

// Keep native Fetch integration tests in the dynamic port range, above its blocked ports.
export async function listenForFetch(server: Server): Promise<void> {
  for (let port = 49152; port <= 65535; port++) {
    const listening = once(server, `listening`)
    server.listen(port, `127.0.0.1`)
    try {
      await listening
      return
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException
      if (code !== `EADDRINUSE` && code !== `EACCES`) throw error
    }
  }
  throw new Error(`No Fetch-compatible test port is available`)
}
