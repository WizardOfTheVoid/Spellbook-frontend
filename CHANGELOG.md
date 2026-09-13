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

## 1.4.2

- Fixed permission issue for teams

## 1.4.3

- Optimized data aggrregation
- Optimized cleanup jobs
- Bug fixes

## 1.5.0

- Ability to transfer team ownership
- Added more tooltip explanations around the app
- Improved UI & UX for team page
- Added ability to rename team
- Improved UI for "My Teams" page
- Rewrote certain text explanations to avoid confusion
- Added app shortcuts in system tray
- Removed UI clutter from player page
- You can now view player offenses by 30 days, 90 days, all time on a player profile
- Added a detailed tooltip for more complex uses like ie. offenses
- Added better formatting for action and offense types
- Misc UI cleanup and improvements

## 1.5.1

- Added navigation history management with back and forward func
- Introduced keybind settings for console and overlay actions
- Created KeybindSetting component for user-defined keybindings
- Implemented ShortcutRegistry for managing keyboard shortcuts
- Enhanced IconButton and PanelHeader components to support navigation actions
- Updated core types to include new keybinds and navigation API
- Added tests for navigation history and shortcut registration
- Added custom keybind for toggling Spellbook
- Added custom keybind for Quick Open Player
- Added conflict checking for keybinds
- Bug fixes
- Added security check for wanted auto banning to ensure user has admin before trying

## 1.6.0

- Improved gamer username normalization
- Grreatly improved speed of player search by 270%, still slow but better!
- Improved search accuracy by adding score relevancy
- Added in-game debug mode (Available in settings)
- Improved background command allowance detection
- Cleanup on user profile
- Improved onboarding
- Bug fixes

## 1.6.1

- Fixed bug where adminsay and serversay stopped working
- Improved debug overlay
- Improved in-game communication with console
- Bug fixes
- Fixed weird UI for buttons in game server panel

## 1.7.0

- HUGE UPDATE, some say the biggest, no one does huge updates like me, in fact, i invented huge updates. People say 'magic... how do you do it?', big, fantastic, update
- Redesigned the entire core command queue system
- Optimized core to allow in-game commands with 10 commands per second
- Improved user experience: First time users
- Improved user experience: For new updates
- Added validation for: In game video mode
- Added validation for: In-game console Keybind
- Added validation for: In-game console enabled
- Added protective layer to ensure admin doesn't execute commands if keybinds are not set.
- Fixed bug where ALT and chat keys would not count as "is moving"
- Improved notification system to ensure delivery both in-game and out of game
- Added more settings in... settings
- Added debug (F5) and debug visualization (F6) while in-game
- Normalized components so that we follow DRY principle
- Improved profile page by splitting it into 3 tabs
- Added changelogs in debug modal
- Added better warning and errors for various things
- Moved ownership for Game Servers to Teams, instead of Profiles
- Improved dashboard graph colors
- Profiles now can attach themselves to servers claimed/owned by a team uniquely
- Private profiles can attach themselves to any server owned by any team user is in, non-uniquely
- Optimized search to be faster. From ~12.4 seconds down to ~2.3 seconds
- Moved all notification types into one shared system
- Tons of minor UI changes
- Improved sorting on team members
- Wanted: Checks for wanted players every second
- Wanted: Optimized caching and request compute per call
- Wanted: Hive mind now gets notified if they are on server
- Wanted: Made it clearer which wanted players are mock wanted and not
- Wanted: Improved wanted system
- Wanted: Players now claims a player to ban
- A lot of other small bug fixes and tweaks

## 1.8.0

- HUGE UPDATE, some say the biggest, no one does huge updates like me, in fact, i invented huge updates. People say 'magic... how do you do it?', big, fantastic, update
- Redesigned the entire core command queue system
- Optimized core to allow in-game commands with 10 commands per second
- Improved user experience: First time users
- Improved user experience: For new updates
- Added validation for: In game video mode
- Added validation for: In-game console Keybind
- Added validation for: In-game console enabled
- Added protective layer to ensure admin doesn't execute commands if keybinds are not set.
- Fixed bug where ALT and chat keys would not count as "is moving"
- Improved notification system to ensure delivery both in-game and out of game
- Added more settings in... settings
- Added debug (F5) and debug visualization (F6) while in-game
- Normalized components so that we follow DRY principle
- Improved profile page by splitting it into 3 tabs
- Added changelogs in debug modal
- Added better warning and errors for various things
- Moved ownership for Game Servers to Teams, instead of Profiles
- Improved dashboard graph colors
- Profiles now can attach themselves to servers claimed/owned by a team uniquely
- Private profiles can attach themselves to any server owned by any team user is in, non-uniquely
- Optimized search to be faster. From ~12.4 seconds down to ~2.3 seconds
- Moved all notification types into one shared system
- Tons of minor UI changes
- Improved sorting on team members
- Wanted: Checks for wanted players every second
- Wanted: Optimized caching and request compute per call
- Wanted: Hive mind now gets notified if they are on server
- Wanted: Made it clearer which wanted players are mock wanted and not
- Wanted: Improved wanted system
- Wanted: Players now claims a player to ban
- A lot of other small bug fixes and tweaks

## 1.8.1

- HUGE UPDATE, some say the biggest, no one does huge updates like me, in fact, i invented huge updates. People say 'magic... how do you do it?', big, fantastic, update
- Redesigned the entire core command queue system
- Optimized core to allow in-game commands with 10 commands per second
- Improved user experience: First time users
- Improved user experience: For new updates
- Added validation for: In game video mode
- Added validation for: In-game console Keybind
- Added validation for: In-game console enabled
- Added protective layer to ensure admin doesn't execute commands if keybinds are not set.
- Fixed bug where ALT and chat keys would not count as "is moving"
- Improved notification system to ensure delivery both in-game and out of game
- Added more settings in... settings
- Added debug (F5) and debug visualization (F6) while in-game
- Normalized components so that we follow DRY principle
- Improved profile page by splitting it into 3 tabs
- Added changelogs in debug modal
- Added better warning and errors for various things
- Moved ownership for Game Servers to Teams, instead of Profiles
- Improved dashboard graph colors
- Profiles now can attach themselves to servers claimed/owned by a team uniquely
- Private profiles can attach themselves to any server owned by any team user is in, non-uniquely
- Optimized search to be faster. From ~12.4 seconds down to ~2.3 seconds
- Moved all notification types into one shared system
- Tons of minor UI changes
- Improved sorting on team members
- Wanted: Checks for wanted players every second
- Wanted: Optimized caching and request compute per call
- Wanted: Hive mind now gets notified if they are on server
- Wanted: Made it clearer which wanted players are mock wanted and not
- Wanted: Improved wanted system
- Wanted: Players now claims a player to ban
- A lot of other small bug fixes and tweaks

## 1.8.2

- Fixed double quote issue for serversay messages in the Wanted system

## 1.9.0

- Bug fix: game server now clears when you leave the game
- Improvement: SpellBook now reports correct warning for: Game not running, in main menu, not in a game server, game not focused
- Keybind for in-game console is now persistent
- Added 12.7 million historic usernames (Thank you Report 😭)
- Added a new tick action to enrich players without statistics

## 1.9.1

- Search: Improved search algorithm
- Search: Optimized api for handling 12.9 million players
- Search: Added ability to search alt names
- Search: Visually show partial search match results
- Search: Display player alias if search matches it
- Player rows now has dynamic font sizing for names

## 1.9.2

- Removed limit for alias

## 1.10.0

- Added tighter check on canExecuteCommand checks
- Actions doesn't become delayed anymore
- Added styling to game server menu item if you're in a server
- Fixed 'add wanted player' modal
- Fixed quick actions being available when not in the game
- Improved app handling of server state and data
- Relaxed background pulse commands
- Improved tooltip handling

## 1.10.1

- Core Queue now prioritizes user actions infront of system actions
- Tuned disabling mouse during roundtrip for app driven user actions
