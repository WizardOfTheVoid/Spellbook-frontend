import { join } from 'node:path'

type RendererWindow = {
  loadFile(path: string, options: { hash: string }): Promise<unknown>
  loadURL(url: string): Promise<unknown>
}

export function loadRendererRoute(
  window: RendererWindow,
  mainDirectory: string,
  route: string,
  developmentUrl?: string
): void {
  if (developmentUrl) {
    void window.loadURL(`${developmentUrl.replace(/\/+$/u, ``)}/#${route}`)
    return
  }

  void window.loadFile(join(mainDirectory, `../renderer/index.html`), { hash: route })
}
