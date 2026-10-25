export function resolveSetupView(input: { authenticated: boolean, profileRequired: boolean, operational: boolean, setupLoaded: boolean, setupRequired: boolean, settingsOpen?: boolean, modalOpen?: boolean }): `existing` | `loading` | `consoleSetup` {
  if (!input.authenticated || input.profileRequired || !input.operational) return `existing`
  if (!input.setupLoaded) return `loading`
  return input.modalOpen || input.setupRequired && !input.settingsOpen ? `consoleSetup` : `existing`
}
