import assert from "node:assert/strict"
import test from "node:test"
import {
  insertMessageTag,
  messageTagDefinitions,
  missingMessageVariables,
  resolveMessageTemplate
} from "./messageTags"

test(`exposes the built-in message tags`, () => {
  assert.deepEqual(messageTagDefinitions, [
    { key: `user`, tag: `[user]`, description: `Player display name` },
    { key: `duration`, tag: `[duration]`, description: `Command time in hours or MAX` },
    { key: `admin`, tag: `[admin]`, description: `Selected admin username` },
    { key: `playfab`, tag: `[playfab]`, description: `Player PlayFab ID` },
    { key: `offenses`, tag: `[offenses]`, description: `Recorded offense count` },
    { key: `server_name`, tag: `[server_name]`, description: `Active server name, set on Servers` },
    { key: `clan_name`, tag: `[clan_name]`, description: `Active server clan name, set on Servers` },
    { key: `clan_tag`, tag: `[clan_tag]`, description: `Active server clan tag, set on Servers` }
  ])
})

test(`resolves built-in message tags`, () => {
  assert.equal(
    resolveMessageTemplate(
      `[user]|[duration]|[admin]|[playfab]|[offenses]`,
      { user: `Alice`, duration: `MAX`, admin: `Admin`, playfab: `PLAYER_1`, offenses: `2` }
    ),
    `Alice|MAX|Admin|PLAYER_1|2`
  )
})

test(`resolves variables and built-ins once without recursively resolving values`, () => {
  assert.equal(
    resolveMessageTemplate(`[reason]|[loop]|[admin]`, {
      admin: `Admin`,
      variables: [
        { key: `reason`, value: `[admin] says` },
        { key: `loop`, value: `[loop] done` }
      ]
    }),
    `[admin] says|[loop] done|Admin`
  )
})

test(`built-ins override colliding custom variables`, () => {
  assert.equal(resolveMessageTemplate(`[user]|[admin]`, {
    user: `Player`,
    admin: `Admin`,
    variables: [
      { key: `user`, value: `Wrong player` },
      { key: `admin`, value: `Wrong admin` }
    ]
  }), `Player|Admin`)
})

test(`resolves active server values`, () => {
  assert.equal(
    resolveMessageTemplate(`[clan_tag] [clan_name] on [server_name]`, {
      serverName: `Templars Duel`,
      clanName: `The Templars`,
      clanTag: `TT`
    }),
    `TT The Templars on Templars Duel`
  )
})

test(`resolves variable fallbacks once without recursively expanding values`, () => {
  assert.equal(resolveMessageTemplate(`[rules_url]`, { variables: [] }), ``)
  assert.equal(resolveMessageTemplate(`[rules_url|Our rules]`, { variables: [] }), `Our rules`)
  assert.equal(resolveMessageTemplate(`[rules_url|]`, { variables: [] }), ``)
  assert.equal(resolveMessageTemplate(`[rules_url|A|B]`, { variables: [] }), `A|B`)
  assert.equal(resolveMessageTemplate(`[rules_url|[admin]]`, { admin: `JohnChivalry`, variables: [] }), `[admin]`)
  assert.equal(resolveMessageTemplate(`[loop]`, {
    variables: [{ id: 1, gameServerId: 7, label: `Loop`, key: `loop`, value: `[loop] done`, sortOrder: 0 }]
  }), `[loop] done`)
  assert.equal(resolveMessageTemplate(`[rules_url|Fallback]`, {
    variables: [{ id: 1, gameServerId: 7, label: `Rules`, key: `rules_url`, value: `Stored`, sortOrder: 0 }]
  }), `Stored`)
  assert.equal(resolveMessageTemplate(`[rules_url|Fallback]`, {
    variables: [{ id: 1, gameServerId: 7, label: `Rules`, key: `rules_url`, value: `   `, sortOrder: 0 }]
  }), `Fallback`)
  assert.equal(resolveMessageTemplate(`[not closed`, { variables: [] }), `[not closed`)
})

test(`finds missing variables in first-use order and ignores context tags and fallbacks`, () => {
  assert.deepEqual(missingMessageVariables([
    `[user] [rules_url] [blank] [rules_url]`,
    `[server_name] [unknown] [optional|Fallback] [empty|]`
  ], [
    { key: `rules_url`, value: `https://example.com/rules` },
    { key: `blank`, value: `   ` }
  ]), [`blank`, `unknown`])
})

test(`inserts a tag at the caret`, () => {
  assert.deepEqual(insertMessageTag(`Hello `, `[admin]`, 6, 6, 180), {
    value: `Hello [admin]`,
    selectionStart: 13,
    selectionEnd: 13
  })
})

test(`replaces the selected text`, () => {
  assert.deepEqual(insertMessageTag(`Hello name`, `[admin]`, 6, 10, 180), {
    value: `Hello [admin]`,
    selectionStart: 13,
    selectionEnd: 13
  })
})

test(`does not exceed the target maximum length`, () => {
  assert.deepEqual(insertMessageTag(`12345`, `[admin]`, 5, 5, 8), {
    value: `12345`,
    selectionStart: 5,
    selectionEnd: 5
  })
})
