import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [file, hash, output] = process.argv.slice(2)
app.setPath(`userData`, dirname(output))
app.setPath(`sessionData`, dirname(output))
app.commandLine.appendSwitch(`disable-gpu`)

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false })

  try {
    await window.loadFile(file, { hash })
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
    const result = await window.webContents.executeJavaScript(`({
      text: document.body.innerText.trim(),
      url: location.href
    })`)
    writeFileSync(output, JSON.stringify(result))
  } catch (error) {
    writeFileSync(output, JSON.stringify({ error: String(error) }))
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
