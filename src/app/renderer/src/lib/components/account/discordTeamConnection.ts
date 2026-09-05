import type { DiscordInstallResult, DiscordTeamConnection } from '$lib/core'
import type { Tone } from '$lib/types/tone'

export type DiscordConnectionState =
  | { status: `checking` }
  | { status: `unlinked` }
  | { status: `linking` }
  | { status: `connected`, connection: DiscordTeamConnection }
  | { status: `failed`, message: string, connection?: DiscordTeamConnection }

export type DiscordTilePresentation = {
  title: string
  subtitle: string
  tone: Tone
  disabled: boolean
}

export function discordConnectionState(connection: DiscordTeamConnection | null): DiscordConnectionState {
  return connection ? { status: `connected`, connection } : { status: `unlinked` }
}

export function discordActionConnection(state: DiscordConnectionState): DiscordTeamConnection | null {
  return state.status === `connected` || state.status === `failed`
    ? state.connection ?? null
    : null
}

export function completedDiscordConnection(
  selectedTeamId: number,
  result: DiscordInstallResult
): { state: DiscordConnectionState, celebrate: boolean } | null {
  if (result.teamId !== undefined && result.teamId !== selectedTeamId) return null
  if (result.status === `success` && result.guildId && result.guildName) {
    return {
      state: discordConnectionState({ guildId: result.guildId, guildName: result.guildName }),
      celebrate: true
    }
  }
  return {
    state: { status: `failed`, message: result.message ?? `Discord installation failed.` },
    celebrate: false
  }
}

export function discordTilePresentation(state: DiscordConnectionState): DiscordTilePresentation {
  if (state.status === `connected`) {
    return {
      title: `SpellBook connected`,
      subtitle: `Connected to ${state.connection.guildName}.`,
      tone: `success`,
      disabled: false
    }
  }
  if (state.status === `failed`) {
    return {
      title: `SpellBook connection failed`,
      subtitle: state.message,
      tone: `danger`,
      disabled: false
    }
  }
  if (state.status === `checking`) {
    return {
      title: `Checking SpellBook connection`,
      subtitle: `Loading Discord server details.`,
      tone: `default`,
      disabled: true
    }
  }
  if (state.status === `linking`) {
    return {
      title: `Finish installing SpellBook`,
      subtitle: `Complete the Discord authorization in your browser.`,
      tone: `default`,
      disabled: true
    }
  }
  return {
    title: `Connect SpellBook`,
    subtitle: `Link one Discord server to this team.`,
    tone: `default`,
    disabled: false
  }
}
