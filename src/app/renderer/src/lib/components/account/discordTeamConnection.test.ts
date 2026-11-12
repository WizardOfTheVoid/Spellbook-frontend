import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completedDiscordConnection,
  discordActionConnection,
  discordConnectionState,
  discordTilePresentation
} from './discordTeamConnection'

test(`successful callback connects the exact guild and marks the tile for celebration`, () => {
  const result = completedDiscordConnection(8, {
    status: `success`,
    teamId: 8,
    guildId: `456`,
    guildName: `KRT Discord`
  })

  assert.deepEqual(result, {
    state: {
      status: `connected`,
      connection: { guildId: `456`, guildName: `KRT Discord` }
    },
    celebrate: true
  })
  const tile = discordTilePresentation(result!.state)
  assert.equal(tile.disabled, false)
  assert.ok(tile.subtitle.includes(`KRT Discord`))
})

test(`failed callback keeps the safe reason visible and ignores another team's result`, () => {
  assert.deepEqual(completedDiscordConnection(8, {
    status: `error`,
    teamId: 8,
    message: `This team is already connected to TT Discord.`
  }), {
    state: {
      status: `failed`,
      message: `This team is already connected to TT Discord.`
    },
    celebrate: false
  })
  assert.equal(completedDiscordConnection(8, {
    status: `success`,
    teamId: 9,
    guildId: `999`,
    guildName: `Other Discord`
  }), null)
})

test(`loaded and unlinked teams are actionable while pending connections are disabled`, () => {
  assert.deepEqual(discordConnectionState(null), { status: `unlinked` })
  assert.deepEqual(discordConnectionState({ guildId: `456`, guildName: `KRT Discord` }), {
    status: `connected`,
    connection: { guildId: `456`, guildName: `KRT Discord` }
  })
  assert.equal(discordTilePresentation({ status: `unlinked` }).disabled, false)
  assert.equal(discordTilePresentation({ status: `checking` }).disabled, true)
  assert.equal(discordTilePresentation({ status: `linking` }).disabled, true)
})

test(`failed unlink keeps the connected guild available for a management retry`, () => {
  const connection = { guildId: `456`, guildName: `KRT Discord` }

  assert.deepEqual(discordActionConnection({
    status: `failed`,
    message: `SpellBook could not be unlinked.`,
    connection
  }), connection)
  assert.equal(discordActionConnection({
    status: `failed`,
    message: `Discord installation failed.`
  }), null)
})
