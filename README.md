# Wavez Discord Presence

Shows your wavez.fm room, current track, artist and DJ as Discord Rich Presence, with a "Join the room" button and a listener count.

Discord Rich Presence only works over a local IPC socket the browser can't reach, so it comes in two parts: a userscript reads the page, and this bridge forwards what it reads to the Discord desktop app.

## Setup

You need [Node.js](https://nodejs.org) and a userscript manager ([Tampermonkey](https://www.tampermonkey.net) or [Violentmonkey](https://violentmonkey.github.io)). No Discord app to create, no config to fill in.

**1.** Open [wavez-discord-presence.user.js](https://raw.githubusercontent.com/fluteds/wavez-discord-presence/main/wavez-discord-presence.user.js) — your userscript manager will offer to install it.

**2. Run the bridge**, and leave it running alongside the Discord desktop app:

```sh
git clone https://github.com/fluteds/wavez-discord-presence
cd wavez-discord-presence
npm install
npm start
```

Open wavez.fm, join a room, and your presence updates automatically.

The bridge has to keep running for presence to show — it's the only thing that can reach Discord. Discord's Rich Presence works over a local IPC socket that a browser cannot touch, which is why this is two pieces rather than just a userscript. Closing the terminal clears your presence; wavez going quiet for 40s clears it too.

## Display

The first line is the track (`title - artist`); the second is the DJ, falling back to the room name. The room's listener count shows as the "party" size, and the track's own thumbnail is used as the artwork when available. A corner badge marks the source (YouTube/SoundCloud), or shows a red **Live** indicator for live streams. Buttons link to the room and, for YouTube tracks, straight to the video.

## Config

Optional. The defaults work as-is — skip this section unless something clashes.

To change anything, copy `config.example.json` to `config.json` (it's gitignored) and set only the keys you care about. Each is also overridable by an env var, which wins over the file:

| Key | Env var | Default |
| --- | --- | --- |
| `appId` | `DISCORD_APP_ID` | the shared wavez.fm presence app |
| `port` | `PORT` | `6969` |
| `largeImage` | `LARGE_IMAGE` | wavez logo |

`appId` is the Discord application whose name and artwork your presence shows under. The bundled default is a public identifier, not a secret — application IDs ship inside every Discord client, so sharing one is expected and safe. Set your own only if you want the presence to appear under a different app name: create a [Discord app](https://discord.com/developers/applications) and copy its Application ID.

`largeImage` is the fallback artwork (an uploaded Rich Presence asset key or an image URL); the track thumbnail takes precedence when present. To use an uploaded asset, add it under **Rich Presence → Art Assets** in your Discord app and reference its key.

Change `port` only if `6969` is taken — if you do, change `BRIDGE` at the top of the userscript to match, since both ends have to agree.

## Versioning

[Semantic versioning](https://semver.org). The bridge and the userscript ship as one unit and share a version: bump `version` in `package.json` and `@version` in the userscript header together, then tag `vX.Y.Z`.

- **Major** — the userscript/bridge wire format changes, so an old userscript no longer talks to a new bridge (or vice versa).
- **Minor** — new presence fields or behaviour, both halves still interoperate.
- **Patch** — fixes only.

The userscript's `@version` is what Tampermonkey compares for auto-updates, so it only ever goes up — never renumber it downward to match something else.

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.

Types in use: `feat`, `fix`, `chore`, `docs`, `refactor`. Scope is optional and is usually `bridge` or `userscript` when a change touches only one half.

`feat` bumps the minor, `fix` bumps the patch, and a `!` (or a `BREAKING CHANGE:` footer) bumps the major — which here means the POST payload changed shape, so an old userscript and a new bridge no longer understand each other.
