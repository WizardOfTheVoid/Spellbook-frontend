# SpellBook development

For the Windows installer and setup instructions, see [README.md](README.md#installation).

This repository contains the Core and overlay app. The client connects to the SpellBook API and Discord integration.

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

The suspended account screen displays the `ACCOUNT_SUSPENDED` error message as the suspension reason, preserving line breaks. The API supplies the saved reason or a fallback when none was recorded.

## Safety

Admin actions require the visible interactive overlay. Core validates the target game and return window before sending input.

No memory injection, anti-cheat bypass, gameplay mutation, hidden punishment logic, or persistence belongs in Core.

## Releases

Public candidates build on GitHub's Windows runner. The workflow checks the installer, checksums, notices, and SBOM before promotion. Release notes live in [CHANGELOG.md](CHANGELOG.md).

Windows installers are currently unsigned. Bundled sounds are project-approved assets with intentionally minimal provenance notes.
