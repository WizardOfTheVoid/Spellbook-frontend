import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { ListPlayersSnapshotParser } from './list-players-parser'

test('extracts new ListPlayers fields from C# casing', () => {
  const result: CoreCallResult = {
    ok: true,
    status: 200,
    statusText: 'OK',
    data: {
      ok: true,
      data: {
        ServerName: '[TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ]',
        NormalizedServerName: '[TT]HOUSEOFTHETEMPLARSDUEL[DiscordggTheTemplars]',
        ServerIp: '5.83.168.223',
        ServerPort: 10010,
        ServerAddress: '5.83.168.223:10010',
        RawText: 'raw',
        RawLines: ['line'],
        ParseWarnings: [],
        Players: [{
          Index: 0,
          Name: 'ᵀᵁᴿᴷ TheForce',
          NormalizedName: 'TURK TheForce',
          PlayfabId: 'NULL',
          RawLine: 'ᵀᵁᴿᴷ TheForce - NULL - -1451974560 - 0 - 0 - 0 ms'
        }]
      }
    }
  }

  const snapshot = ListPlayersSnapshotParser.extract(result)

  assert.equal(snapshot?.serverName, '[TT] HOUSE OF THE TEMPLARS 1V1 DUEL [ Discord gg TheTemplars ]')
  assert.equal(snapshot?.normalizedServerName, '[TT]HOUSEOFTHETEMPLARSDUEL[DiscordggTheTemplars]')
  assert.equal(snapshot?.serverIp, '5.83.168.223')
  assert.equal(snapshot?.serverPort, 10010)
  assert.equal(snapshot?.serverAddress, '5.83.168.223:10010')
  assert.equal(snapshot?.players[0]?.name, 'ᵀᵁᴿᴷ TheForce')
  assert.equal(Object.hasOwn(snapshot?.players[0] ?? {}, 'normalizedName'), false)
})

test('extracts new ListPlayers fields from JavaScript casing', () => {
  const result: CoreCallResult = {
    ok: true,
    status: 200,
    statusText: 'OK',
    data: {
      serverName: 'Duel Server 1v1',
      normalizedServerName: 'DuelServer',
      serverIp: '127.0.0.1',
      serverPort: 7777,
      serverAddress: '127.0.0.1:7777',
      rawText: 'raw',
      rawLines: [],
      parseWarnings: [],
      players: [{
        index: 0,
        name: 'MΔGIC.',
        normalizedName: 'MDGIC.',
        playfabId: '25F6D104A89A3070',
        rawLine: 'MΔGIC. - 25F6D104A89A3070 - -1621442496 - 0 - 0 - 0 ms'
      }]
    }
  }

  const snapshot = ListPlayersSnapshotParser.extract(result)

  assert.equal(snapshot?.serverName, 'Duel Server 1v1')
  assert.equal(snapshot?.normalizedServerName, 'DuelServer')
  assert.equal(snapshot?.serverAddress, '127.0.0.1:7777')
  assert.equal(snapshot?.players[0]?.name, 'MΔGIC.')
  assert.equal(Object.hasOwn(snapshot?.players[0] ?? {}, 'normalizedName'), false)
})

test('validates player names without changing their original whitespace', () => {
  const snapshot = ListPlayersSnapshotParser.extract({
    ok: true,
    status: 200,
    statusText: `OK`,
    data: {
      players: [
        { name: `  Exact Player  `, playfabId: `PLAYER`, rawLine: `raw` },
        { name: `   `, playfabId: `BLANK`, rawLine: `raw` }
      ]
    }
  })

  assert.equal(snapshot?.players.length, 1)
  assert.equal(snapshot?.players[0]?.name, `  Exact Player  `)
})
