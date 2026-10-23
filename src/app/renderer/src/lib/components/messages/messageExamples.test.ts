import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActionCommand } from '@spellbook/shared/actions/actionTypes'
import { renderActionMessage } from '@spellbook/shared/actions/actionMessage'
import { messageExampleSource, renderMessagePreview, messagePreviewCount } from './messageExamples'

test(`preview counts resolved characters and marks variable templates as estimates`, () => {
  assert.equal(messagePreviewCount(`Hello [user]`, `Hello Samwise`), `~13/180`)
  assert.equal(messagePreviewCount(`[reason|Follow the rules]`, `Follow the rules`), `~16/180`)
  assert.equal(messagePreviewCount(`Hello`, `[SB] Hello`), `10/180`)
  assert.equal(messagePreviewCount(`No variables`, `No variables`), `12/180`)
  assert.equal(messagePreviewCount(`[user]`, `Samwise`), `~7/180`)
  assert.equal(messagePreviewCount(`[user]`, `Bob`), `~3/180`)
})

const command = (commandType: ActionCommand[`commandType`], sortOrder: number, durationHours = 24): ActionCommand => ({
  commandType, sortOrder, durationHours, delayMs: 0, offenseType: `verbal_abuse`, message: `[action_type_pt] for [duration] hours: [offense_type]`
})
const context = { admin: `Admin`, serverName: `Server` }

test(`moderation previews omit configured prefixes while chat previews retain them`, () => {
  const prefixed = { ...context, variables: [
    { key: `serversay_prefix`, value: `[SB]` },
    { key: `adminsay_prefix`, value: `[Admin]` }
  ] }
  for (const kind of [`ban`, `incremental_ban`, `kick`] as const) {
    assert.equal(renderMessagePreview({ ...command(kind, 0), message: `Reason` }, prefixed), `Reason`)
  }
  assert.equal(renderMessagePreview({ ...command(`server_message`, 0), message: `Hello` }, prefixed), `[SB] Hello`)
  assert.equal(renderMessagePreview({ ...command(`admin_message`, 0), message: `Hello` }, prefixed), `[Admin] Hello`)
})

test(`preview examples use a ban sibling even when it follows the message`, () => {
  const message = command(`server_message`, 0)
  const ban = command(`ban`, 1, 48)
  const source = messageExampleSource([message, ban], message)
  assert.equal(renderActionMessage(message, context, source), `banned for 48 hours: Verbal Abuse`)
})

test(`the first kick or ban in action order supplies all moderation examples`, () => {
  const message = command(`admin_message`, 3)
  const kick = command(`kick`, 1, 2)
  const ban = command(`ban`, 2, 72)
  const source = messageExampleSource([ban, message, kick, command(`warn`, 0)], message)
  assert.equal(renderActionMessage(message, context, source), `kicked for 2 hours: Verbal Abuse`)
})

test(`commands without a ban or kick retain their existing example context`, () => {
  const warning = command(`warn`, 0)
  const message = command(`server_message`, 1)
  assert.equal(messageExampleSource([warning, message], message), warning)
  assert.equal(messageExampleSource([message], message), undefined)
})
