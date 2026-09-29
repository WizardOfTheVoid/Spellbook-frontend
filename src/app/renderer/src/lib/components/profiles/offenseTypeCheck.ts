import type { PlayerOffenseType, ServerProfileAction, ServerProfileCommand } from '$lib/core'
import { playerOffenseTypes } from '@spellbook/shared/playerBans.js'

const offenseKeywords: Record<PlayerOffenseType, readonly string[]> = {
  hacker: [`hacker`, `hacking`, `hack`, `hacks`, `cheater`, `cheating`, `cheat`, `cheats`,
    `speedhack`, `speed hack`, `aimbot`, `wallhack`],
  ffa: [`ffa`, `free for all`, `rdm`, `random deathmatch`, `random death match`],
  verbal_abuse: [`verbal abuse`, `abusive language`, `chat abuse`, `slur`, `slurs`, `hate speech`, `racism`, `racist`],
  griefing: [`grief`, `griefing`, `griefer`, `griefers`, `sabotage`, `teamkilling`, `team killing`],
  exploiting: [`exploit`, `exploits`, `exploiting`, `exploiter`, `exploiters`, `bug abuse`, `glitch abuse`, `glitching`],
  toxic_behavior: [`toxic`, `toxicity`, `toxic behavior`, `toxic behaviour`, `unsportsmanlike`, `poor sportsmanship`],
  low_level: [`low level`, `lowlevel`, `low rank`, `level too low`, `rank too low`, `below minimum level`, `below minimum rank`],
  votekick_abuse: [`votekick abuse`, `vote kick abuse`, `abusing votekick`, `abusing vote kick`,
    `false votekick`, `false vote kick`, `malicious votekick`],
  other: []
}

export function findOffenseTypeMismatches(action: Pick<ServerProfileAction, `label` | `description` | `commands`> | null,
  command: Pick<ServerProfileCommand, `commandType` | `offenseType`> | null): PlayerOffenseType[] {
  if (!action || !command?.offenseType || ![`ban`, `kick`, `warn`, `incremental_ban`].includes(command.commandType)) return []
  const texts = [action.label, action.description ?? ``, ...action.commands.map(command => command.message)]
    .map(value => ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ` `).trim()} `)
  return playerOffenseTypes.filter(offenseType => offenseType !== command.offenseType
    && offenseKeywords[offenseType].some(keyword => texts.some(text => text.includes(` ${keyword} `))))
}
