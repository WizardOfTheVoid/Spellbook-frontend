# Changelog

## 1.0.0

- Released version 1.0.0 BETA

## 1.0.1

- Fixed release validation, i think

## 1.0.2

- added preflight commit head check

## 1.0.3

- remove .NET setup and redundant npm commands from release workflow

## 1.0.4

- Added retries for NPM registry - It seems unstable..

## 1.0.5

- Removed npm audit from pre-flight ci

## 1.0.6

- bugfix on npm dep sec

## 1.0.7

- fixed small github private repo issue

## 1.0.8

- Made dependabot optional

## 1.0.9

- Fixed an Host API failure

## 1.0.10

- Bug with test unit

## 1.0.11

- Added better user flow for first time logins.

## 1.0.12

- Fixed CI bug

## 1.0.13

- CI bugfix

## 1.0.14

- Improved isMoving

## 1.0.15

- Fixed isMovement so that commands do not interrupt gameplay

## 1.0.16

- Moved icons to local
- Fixed startup not loading correctly
- Added toggle on system tray click

## 1.0.17

- Added suspension reason for banned user

## 1.0.18

- Fixed security in repo being overly-angry at me

## 1.0.19

- Tiny fix on test unit

## 1.1.0

- Improved user experience on first start-up
- Added explanations around in the app
- Added the ability to request access to a team
- Added a account checklist for onboarding
- Made playfabID a must for admins
- Added confetti!!!
- Added debug page
- Added easier navigation between profiles and teams
- Added support for changing Chivalry 2 console key
- Added check to see if user is connected to TWA discord
- Added "Are you sure"-dialogue boxes on sensitive clicks
- Added "Discard changes? Yes/No" on certain pages, to avoid accidental deletiton
- Improved UI structure for "My teams"
- Improved auto update message
- Users are now forced to update on major versions
- Added a glow on debug button, because people love glowy things

## 1.1.1

- Discord bot now drops update notices
- Team owners & admins can now delete their teams. Exciting

## 1.1.2

- Bug fixes

## 1.2.0

- Added right-click duplicate and delete for actions and commands
- Added empty, team, and default options when creating profiles
- Replaced Reset with Restore while keeping server claims
- Enabled superadmins to edit the default profile
- Improved team and personal profile headings
- Updated the default actions and commands

## 1.2.1

- Added a Default-editing warning for superadmins.
- Create/Restore dialogs now expand to fit dropdowns.
- Added SFX for profile action dragging, clicks, etc
- Bug fixes

## 1.2.2

- Update to bot and communication with bot
- Added new user commands

## 1.2.3

- Bug fix

## 1.2.4

- Improved UX for game server actions

## 1.3.0

- Large changes to architecture to ensure optimization of large datasets
- Added support for showing players in claimed servers

## 1.4.0

- Optimized immense lag in player archive filter
- Fixed versioning issue
- Added pagination to notifications
- Added ability for superadmin to notify users and teams
- Added logic gate checks to player actions to ensure no duplicate punishment logging.
- Added a "delete all" button to notification panel
- Added the ability to see players in your server
- On a server, added a button to team if you are part of the owner team
- Changed "Mine" filter tag to "Claimed" in server browser
- On a team, added "claimed servers" that links to server browser with "Claimed" enabled
- Added ability to enable/disable profiles per user
- Added ability to open context menu on profiles
- Added ability to duplicate a profile from context menu
- Changed "Assigned servers" to "Claimed servers" on profile page, for text normalization
- Admin: Show version in user rows
- Player rows now show them as red bordered if they are banned, yellow if they are recently punished
- Added a "No rank" filter tag in player archives
- Hovering over a punished player shows their current punishment/offense
- Tracking online & game status of all 5.8 million players
- Your avatar, and "My teams" nav button gets a red circle with a number if you have any pending members for your team or other pending things
- Changed max ban time in profile command builder to 1337 hours
- Hid "ban time" when type is not "ban"
- Enabled "Online" tag for player archives
- Enabled showing which server a online player is in, as long as the team has claimed the server that player is in

## 1.4.1

- Users now get to set console key during onboarding
- Superadmins can now create profile presets
