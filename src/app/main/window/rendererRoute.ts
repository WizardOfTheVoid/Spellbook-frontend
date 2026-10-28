import type { Protocol } from 'electron'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const rendererScheme = `spellbook`
const rendererHost = `renderer`
const rendererOrigin = `${rendererScheme}://${rendererHost}`

type RendererWindow = {
  loadURL(url: string): Promise<unknown>
}

type FetchFile = (url: string) => Promise<Response>

export function registerRendererScheme(
  protocol: Pick<Protocol, 'registerSchemesAsPrivileged'>
): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: rendererScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }])
}

export function installRendererProtocol(
  protocol: Pick<Protocol, 'handle'>,
  fetchFile: FetchFile,
  rendererRoot: string
): void {
  const root = resolve(rendererRoot)
  protocol.handle(rendererScheme, async request => {
    const file = resolveRendererFile(root, request.url)
    if (!file) return new Response(null, { status: 404 })

    try {
      return await fetchFile(pathToFileURL(file).toString())
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

export function rendererUrl(route: string, developmentUrl?: string): string {
  const origin = developmentUrl?.replace(/\/+$/u, ``) ?? rendererOrigin
  return `${origin}/#${route}`
}

export function loadRendererRoute(
  window: RendererWindow,
  _mainDirectory: string,
  route: string,
  developmentUrl?: string
): void {
  void window.loadURL(rendererUrl(route, developmentUrl))
}

function resolveRendererFile(root: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== `${rendererScheme}:` || url.host !== rendererHost) return null

    const pathname = decodeURIComponent(url.pathname)
    const requestPath = pathname === `/` ? `index.html` : pathname.slice(1)
    const file = resolve(root, requestPath)
    const child = relative(root, file)
    return child !== `` && child !== `..` && !child.startsWith(`..${sep}`) && !isAbsolute(child)
      ? file
      : null
  } catch {
    return null
  }
}
