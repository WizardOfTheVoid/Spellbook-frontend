export type MarkdownFormat = `bold` | `italic` | `strike` | `code` | `codeBlock` | `h1` | `h2` | `h3` | `bullet` | `number` | `quote`

export type MarkdownEdit = {
  start: number
  end: number
  text: string
  selectionStart: number
  selectionEnd: number
}

export function formatMarkdown(value: string, start: number, end: number, format: MarkdownFormat): MarkdownEdit {
  const marker = { bold: `**`, italic: `*`, strike: `~~`, code: `\`` }[format as `bold` | `italic` | `strike` | `code`]
  if (marker) {
    const selected = value.slice(start, end)
    const oddStars = (text: string, atEnd = false) => (text.match(atEnd ? /\*+$/ : /^\*+/)?.[0].length ?? 0) % 2 === 1
    if (selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)
      && (format !== `italic` || oddStars(selected) && oddStars(selected, true))) {
      return edit(start, end, selected.slice(marker.length, -marker.length))
    }
    const before = value.slice(0, start)
    const after = value.slice(end)
    const hasItalic = oddStars(before, true) && oddStars(after)
    if (before.endsWith(marker) && after.startsWith(marker) && (format !== `italic` || hasItalic)) {
      return edit(start - marker.length, end + marker.length, selected)
    }
    return edit(start, end, `${marker}${selected}${marker}`, marker.length, marker.length + selected.length)
  }

  const lineStart = start === 0 ? 0 : value.lastIndexOf(`\n`, start - 1) + 1
  const last = end > start && value[end - 1] === `\n` ? end - 1 : end
  const nextLine = value.indexOf(`\n`, last)
  const lineEnd = nextLine === -1 ? value.length : nextLine - (value[nextLine - 1] === `\r` ? 1 : 0)
  const selected = value.slice(lineStart, lineEnd)
  if (format === `codeBlock`) {
    const newline = value.includes(`\r\n`) ? `\r\n` : `\n`
    const fence = `\`\`\`${newline}`
    const closing = `${newline}\`\`\``
    if (selected.startsWith(fence) && selected.endsWith(closing)) return edit(lineStart, lineEnd, selected.slice(fence.length, -closing.length))
    return edit(lineStart, lineEnd, `${fence}${selected}${closing}`, fence.length, fence.length + selected.length)
  }

  const heading = /^h[123]$/.test(format)
  const prefix = heading ? `${`#`.repeat(Number(format[1]))} ` : format === `bullet` ? `- ` : format === `quote` ? `> ` : `1. `
  const pattern = heading ? /^(#{1,3}) / : format === `bullet` ? /^[-*+] / : format === `quote` ? /^> / : /^\d+\. /
  const lines = selected.split(/(\r?\n)/)
  const content = lines.filter((_, index) => index % 2 === 0).filter(line => line.trim())
  const removing = content.length > 0 && content.every(line => {
    const match = line.trimStart().match(pattern)
    return match && (!heading || match[0] === prefix)
  })
  let number = 0
  const text = lines.map((line, index) => {
    if (index % 2 || (!line.trim() && selected.length)) return line
    const indent = line.match(/^[\t ]*/)?.[0] ?? ``
    const body = line.slice(indent.length).replace(pattern, ``)
    return `${indent}${removing ? `` : format === `number` ? `${++number}. ` : prefix}${body}`
  }).join(``)
  return edit(lineStart, lineEnd, text)
}

function edit(start: number, end: number, text: string, selectionStart = 0, selectionEnd = text.length): MarkdownEdit {
  return { start, end, text, selectionStart: start + selectionStart, selectionEnd: start + selectionEnd }
}
