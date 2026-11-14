import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'

type OpenExternal = (url: string) => Promise<unknown>
type JsonRecord = Record<string, unknown>

export class DiscordInstallIpcHandlers {
  public constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient,
    private readonly openExternal: OpenExternal
  ) {}

  public register(): void {
    this.ipcMain.handle('discord:install', async (_event, payload: unknown) => {
      const teamId = this.requiredTeamId(payload)
      const result = await this.httpClient.postServer(`/teams/${teamId}/discord-install`, {})
      const url = this.installUrl(result)
      await this.openExternal(url)
      return result
    })
  }

  private requiredTeamId(payload: unknown): number {
    const teamId = this.record(payload).teamId
    if (!Number.isInteger(teamId) || Number(teamId) < 1) {
      throw new Error('teamId must be a positive integer.')
    }
    return Number(teamId)
  }

  private installUrl(result: CoreCallResult): string {
    const envelope = this.record(result.data)
    const data = this.record(envelope.data)
    if (!result.ok || typeof data.url !== 'string') throw this.invalidUrl()

    let url: URL
    try {
      url = new URL(data.url)
    } catch {
      throw this.invalidUrl()
    }

    if (
      url.protocol !== 'https:'
      || !['discord.com', 'www.discord.com'].includes(url.hostname)
      || url.pathname !== '/oauth2/authorize'
      || url.username
      || url.password
    ) {
      throw this.invalidUrl()
    }
    return url.toString()
  }

  private record(value: unknown): JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as JsonRecord
      : {}
  }

  private invalidUrl(): Error {
    return new Error('Discord install URL is missing or invalid.')
  }
}
