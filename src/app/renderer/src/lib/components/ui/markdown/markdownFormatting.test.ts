import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMarkdown, type MarkdownFormat } from './markdownFormatting'

function apply(value: string, start: number, end: number, format: MarkdownFormat) {
  const change = formatMarkdown(value, start, end, format)
  return { ...change, value: `${value.slice(0, change.start)}${change.text}${value.slice(change.end)}` }
}

test(`inline formatting preserves surrounding text and selects the original content`, () => {
  const change = apply(`Before words after`, 7, 12, `bold`)
  assert.equal(change.value, `Before **words** after`)
  assert.equal(change.value.slice(change.selectionStart, change.selectionEnd), `words`)
  assert.equal(apply(change.value, change.selectionStart, change.selectionEnd, `bold`).value, `Before words after`)
  assert.equal(apply(`**words**`, 0, 9, `bold`).value, `words`)
})

test(`empty inline formatting places the caret between markers`, () => {
  const change = apply(`hello`, 5, 5, `italic`)
  assert.equal(change.value, `hello**`)
  assert.equal(change.selectionStart, 6)
  assert.equal(change.selectionEnd, 6)
})

test(`italic formatting composes with bold instead of removing its markers`, () => {
  const change = apply(`**words**`, 2, 7, `italic`)
  assert.equal(change.value, `***words***`)
  assert.equal(apply(change.value, change.selectionStart, change.selectionEnd, `italic`).value, `**words**`)
  assert.equal(apply(`**words**`, 0, 9, `italic`).value, `***words***`)
})

test(`headings apply to the current line, replace the heading level and toggle off`, () => {
  assert.equal(apply(`before\n## title\nafter`, 10, 10, `h1`).value, `before\n# title\nafter`)
  assert.equal(apply(`# title`, 3, 3, `h1`).value, `title`)
  assert.equal(apply(``, 0, 0, `h3`).value, `### `)
})

test(`line formatting preserves CRLF, indentation and unselected lines`, () => {
  const value = `before\r\n  first\r\nsecond\r\nafter`
  const change = apply(value, 10, 25, `number`)
  assert.equal(change.value, `before\r\n  1. first\r\n2. second\r\nafter`)
  assert.equal(apply(change.value, change.selectionStart, change.selectionEnd, `number`).value, value)
})

test(`a selection ending at the next line does not format that line`, () => {
  assert.equal(apply(`one\ntwo\nthree`, 0, 4, `bullet`).value, `- one\ntwo\nthree`)
  assert.equal(apply(`one\n\ntwo`, 0, 8, `quote`).value, `> one\n\n> two`)
})

test(`code blocks preserve content and can be removed`, () => {
  const change = apply(`before\r\ncode\r\nafter`, 8, 12, `codeBlock`)
  assert.equal(change.value, `before\r\n\`\`\`\r\ncode\r\n\`\`\`\r\nafter`)
  assert.equal(change.value.slice(change.selectionStart, change.selectionEnd), `code`)
  assert.equal(apply(`\`\`\`\ncode\n\`\`\``, 0, 12, `codeBlock`).value, `code`)
})
