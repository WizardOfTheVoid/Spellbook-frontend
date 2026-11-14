import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePlayerNoteDisplay, type PlayerNoteDisplaySegment } from './playerNoteDisplay'

test(`formats adjacent italic lines, underline and nested bold italics`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`*first*\n*second* __***combined***__`), [
    { type: `em`, content: [{ type: `text`, content: `first` }] },
    { type: `br` },
    { type: `em`, content: [{ type: `text`, content: `second` }] },
    { type: `text`, content: ` ` },
    { type: `underline`, content: [{ type: `em`, content: [{ type: `strong`, content: [{ type: `text`, content: `combined` }] }] }] },
  ])
})

test(`parses the supplied Discord markdown with list continuations and reference tokens`, () => {
  const content = [
    `# Headline`, `-# Small text`, `*italic text 1*`, `*italic text 2*`, `**bold text**`, ``,
    `- list item 1`, `- list item 2`, ``, `* dot item 1`, `* dot item 2`,
    `  \\*not a dot item`, `  ||spoilers||`, `  @[user:41] and @[user:38]`,
  ].join(`\n`)
  const nodes = parsePlayerNoteDisplay(content)
  assert.deepEqual(nodes[0], { type: `heading`, level: 1, content: [{ type: `text`, content: `Headline` }] })
  assert.deepEqual(nodes[1], { type: `subtext`, content: [{ type: `text`, content: `Small text` }] })
  const list = nodes.find(node => node.type === `list`)
  assert.ok(list)
  assert.equal(list.ordered, false)
  assert.equal(list.items.length, 4)
  const continued = flatten(list.items[3])
  assert.ok(continued.some(node => node.type === `text` && node.content.includes(`*not a dot item`)))
  assert.ok(continued.some(node => node.type === `spoiler`))
  assert.deepEqual(continued.filter(node => node.type === `reference`).map(node => node.id), [41, 38])
  assert.equal(continued.filter(node => node.type === `list`).length, 0)
})

test(`keeps references interactive inside formatting and spoilers`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`**@[user:41]** ||#[action:9] @[player:7]||`, true), [
    { type: `strong`, content: [{ type: `reference`, kind: `user`, id: 41 }] },
    { type: `text`, content: ` ` },
    { type: `spoiler`, content: [
      { type: `reference`, kind: `action`, id: 9 },
      { type: `text`, content: ` ` },
      { type: `reference`, kind: `player`, id: 7 },
    ] },
  ])
})

test(`honors escaping and leaves code and HTML as literal content`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`\\*literal\\* \\||visible\\|| \`**@[user:41]**\` <script>alert(1)</script>`), [
    { type: `text`, content: `*literal* ||visible|| ` },
    { type: `inlineCode`, content: `**@[user:41]**` },
    { type: `text`, content: ` <script>alert(1)</script>` },
  ])
})

test(`only recognizes headings at line start with a space and leaves incomplete markers visible`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`#not a heading\ntext # heading\n*unfinished __open ||open`), [
    { type: `text`, content: `#not a heading` },
    { type: `br` },
    { type: `text`, content: `text # heading` },
    { type: `br` },
    { type: `text`, content: `*unfinished __open ||open` },
  ])
})

test(`invalid and disabled reference kinds remain literal`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`@[player:7] @[user:0] #[action:9007199254740992]`), [
    { type: `text`, content: `@[player:7] @[user:0] #[action:9007199254740992]` },
  ])
})

test(`recognizes headings and subtext after a list consumes the preceding newline`, () => {
  const nodes = parsePlayerNoteDisplay(`- first\n- second\n\n# Title\n-# Small\n- next item`)
  assert.deepEqual(nodes.map(node => node.type), [`list`, `heading`, `subtext`, `list`])
})

test(`recognizes a list after a quote and retains nested list indentation`, () => {
  const nodes = parsePlayerNoteDisplay(`> quote\n- item\n  - child\n    - grandchild\n- another`)
  assert.deepEqual(nodes.map(node => node.type), [`blockQuote`, `list`])
  const lists = flatten(nodes).filter(node => node.type === `list`)
  assert.deepEqual(lists.map(node => node.items.length), [2, 1, 1])
})

function flatten(nodes: PlayerNoteDisplaySegment[]): PlayerNoteDisplaySegment[] {
  return nodes.flatMap(node => [
    node,
    ...(`items` in node ? node.items.flatMap(flatten)
      : `content` in node && Array.isArray(node.content) ? flatten(node.content) : []),
  ])
}
