import { app, BrowserWindow, net, protocol } from 'electron'
import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { tsImport } from 'tsx/esm/api'

const [rendererRoot, route, selector, output] = process.argv.slice(2)
const { installRendererProtocol, registerRendererScheme, rendererUrl } = await tsImport(
  `../src/app/main/window/rendererRoute.ts`,
  import.meta.url
)

registerRendererScheme(protocol)
app.setPath(`userData`, dirname(output))
app.setPath(`sessionData`, dirname(output))
app.commandLine.appendSwitch(`disable-gpu`)

app.whenReady().then(async () => {
  installRendererProtocol(protocol, url => net.fetch(url), rendererRoot)
  const window = new BrowserWindow({ show: false })

  try {
    await window.loadURL(rendererUrl(route))
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
    const result = await window.webContents.executeJavaScript(`(() => {
      const icon = document.createElement('i')
      icon.className = 'fa-solid fa-user'
      document.body.append(icon)
      const iconStyle = getComputedStyle(icon, '::before')
      const fontAwesomeLoaded = iconStyle.fontFamily.includes('Font Awesome')
        && !['none', 'normal', '\"\"'].includes(iconStyle.content)
      icon.remove()

      return {
        mounted: Boolean(document.querySelector(${JSON.stringify(selector)})),
        fontAwesomeLoaded,
        text: document.body.innerText.trim(),
        url: location.href
      }
    })()`)
    writeFileSync(output, JSON.stringify(result))
  } catch (error) {
    writeFileSync(output, JSON.stringify({ error: String(error) }))
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
