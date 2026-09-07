import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findMissingTemplateVariables,
  resolveTemplate
} from './messageTemplates'

test(`resolves custom variables once and lets built-ins win collisions`, () => {
  assert.equal(resolveTemplate(
    `[user]|[reason]|[loop]|[missing|Fallback]`,
    { user: `Exact [reason]`, reason: `Built in` },
    [
      { key: `user`, value: `Wrong user` },
      { key: `reason`, value: `Wrong reason` },
      { key: `loop`, value: `[loop] again` }
    ]
  ), `Exact [reason]|Built in|[loop] again|Fallback`)
})

test(`preserves nonblank replacement bytes and treats blank values as missing`, () => {
  assert.equal(resolveTemplate(`[name]|[blank|fallback]`, {}, [
    { key: `name`, value: `  Exact name  ` },
    { key: `blank`, value: `   ` }
  ]), `  Exact name  |fallback`)
})

test(`finds unresolved variables in first-use order`, () => {
  assert.deepEqual(findMissingTemplateVariables(
    [`[user] [rules] [blank] [rules]`, `[server_name] [other] [optional|value]`],
    [{ key: `rules`, value: `stored` }, { key: `blank`, value: ` ` }],
    new Set([`user`, `server_name`])
  ), [`blank`, `other`])
})
