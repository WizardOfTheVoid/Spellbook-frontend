# SpellBook

<!-- markdownlint-disable MD033 -->

<div align="center">
  <img src="src/app/renderer/src/lib/resources/logo-color_transp.png" width="156" alt="SpellBook flame mark">
  <div style="font-size:40px">S P E L L <strong> B O O K</strong></div>
  <div style="font-size:22px">Chivalry 2 Hivemind Admin Tool</div>
  <p>
  
  </p>
  <p>
    <img src="https://img.shields.io/badge/platform-Windows-20242c" alt="Windows">
    <img src="https://img.shields.io/badge/version-1.0.16-f2bd2e" alt="Version 1.0.16">
    <img src="https://img.shields.io/badge/license-PolyForm_Noncommercial-20242c" alt="PolyForm Noncommercial 1.0.0">
  </p>
  <p><b>Built by <u>magic trashcan</u></b></p>
</div>

<!-- markdownlint-enable MD033 -->

**SpellBook** is a in-game overlay that empowers administrators with a rich interface for handling all things regarding moderating Chivalry 2 Game Servers.

This is a mirrored repo, and includes the Core & Overlay app. This client communicates with the back-end API & Discord integration.

## Features

- 🔥 Hivemind auto-banning of hackers
- 🕵️ Automatic alt-account detection
- 🛡️ Integration of all admin commands
- 🪪 Profiles for all players
- 🔐 Login with Discord and team-system
- 🤖 Discord bot integration
- 🌐 Real-time server browser
- 🪄 Profiles and custom in-game command builder
- ⌨️ Anti-AFK
- 📊 Real-time dashboard
- 🛜 Update available notification
- 🚀 *And much, much more...*

## Other features

- 🔔 Real-time notifications
- ⚡ Real-time player information
- ✨ Modern UI
- 🎯 (F4) in-game player detection
- 🔎 Advanced fuzzy search with filters
- 🔊 Sound effects :\]
- ⚙️ User settings and profile
- 📝 Centralized player notes and logs
- 🧰 *And much more...*

## Installation

1. Open the [latest SpellBook release](https://github.com/WizardOfTheVoid/Spellbook-frontend/releases/latest).
2. Download `SpellBook-Setup-<version>.exe` and run it.
3. Sign in with Discord when SpellBook opens.


## Dev / Build

You need Windows, Node.js 22.21.1+, .NET 8, and Chivalry 2.

```powershell
npm ci
npm run dev
```

The Server API defaults to `http://127.0.0.1:48126/api/v1`. Change it with `CHIV_SERVER_URL` when needed.

`src/app/.env` and `src/core/CoreHost/.env` are non-secret runtime configuration. They are loaded in development and shipped with production builds as `resources/app/.env` and `resources/core/.env`. Process environment values take precedence. Keep secrets out of these files; the `.env.example` files document supported settings.

## Commands

```powershell
npm run dev
npm test
npm run check
npm run build
```

Distribution work is explicit:

```powershell
$env:SPELLBOOK_SERVER_URL='https://chivalry2.dev/api/v1'
npm run app:dist
npm run dist:verify
npm run dist:checksums
```

`npm run build` never publishes anything. Packaged builds contain the public Server URL, never a Server token.

## Project map

- `src/app` - Electron, preload, and the Svelte overlay
- `src/core` - local Windows game bridge
- `packages/shared` - shared public types and helpers
- `scripts` - build and release helpers

Electron Main owns windows, workers, settings, HTTP, and Core startup. Preload is the renderer boundary. Core validates the game process, serializes input, and restores focus. Use `@spellbook/shared/*` instead of relative imports across package folders.

## Safety

Admin actions require the visible interactive overlay. Core validates the target game and return window before sending input.

No memory injection, anti-cheat bypass, gameplay mutation, hidden punishment logic, or persistence belongs in Core.

## Releases

Public candidates build on GitHub's Windows runner. The workflow checks the installer, checksums, notices, and SBOM before promotion. Release notes live in [CHANGELOG.md](CHANGELOG.md).

Windows installers are currently unsigned. Bundled sounds are project-approved assets with intentionally minimal provenance notes.

## License

Source is available under [PolyForm Noncommercial 1.0.0](LICENSE.md). Commercial use is not permitted. See [NOTICE.md](NOTICE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


----

☕ magic trashcan
