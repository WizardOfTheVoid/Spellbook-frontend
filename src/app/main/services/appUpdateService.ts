const latestReleaseApi = `https://api.github.com/repos/WizardOfTheVoid/Spellbook-frontend/releases/latest`
const latestReleasePage = `https://github.com/WizardOfTheVoid/Spellbook-frontend/releases/latest`
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

type OpenExternal = (url: string) => Promise<unknown>

export class AppUpdateService {
  constructor(
    private readonly currentVersion: string,
    private readonly fetchRelease: typeof fetch,
    private readonly openExternal: OpenExternal,
  ) {}

  async check(): Promise<string | null> {
    const response = await this.fetchRelease(latestReleaseApi, {
      headers: new Headers({
        Accept: `application/vnd.github+json`,
        [`User-Agent`]: `SpellBook/${this.currentVersion}`,
        [`X-GitHub-Api-Version`]: `2022-11-28`,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`GitHub release request failed with HTTP ${response.status}.`)

    const payload = await response.json() as { tag_name?: unknown }
    const latestVersion = typeof payload.tag_name === `string` && payload.tag_name.startsWith(`v`)
      ? payload.tag_name.slice(1)
      : ``
    if (!stableVersion.test(latestVersion)) throw new Error(`GitHub release response has no stable version.`)

    return isNewerVersion(latestVersion, this.currentVersion) ? latestVersion : null
  }

  async openLatestRelease(): Promise<void> {
    await this.openExternal(latestReleasePage)
  }
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split(`.`).map(Number)
  const currentParts = current.split(`.`).map(Number)
  if (candidateParts.length !== 3 || currentParts.length !== 3 || !stableVersion.test(current)) {
    throw new Error(`Current product release version is invalid.`)
  }

  return candidateParts.some((part, index) =>
    part > currentParts[index]! && candidateParts.slice(0, index).every((value, prior) => value === currentParts[prior]),
  )
}
