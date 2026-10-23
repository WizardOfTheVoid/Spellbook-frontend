export function resolveSetupView(input: { authenticated: boolean, profileRequired: boolean, operational: boolean, setupLoaded: boolean, setupRequired: boolean, settingsOpen?: boolean }): `existing` | `loading` | `consoleSetup` {
  if (!input.authenticated || input.profileRequired || !input.operational) return `existing`
  if (!input.setupLoaded) return `loading`
  return input.setupRequired && !input.settingsOpen ? `consoleSetup` : `existing`
}
