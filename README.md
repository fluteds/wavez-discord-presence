# Wavez Discord Presence

Shows your wavez.fm room, current track, artist and DJ as Discord Rich Presence, with a "Join the room" button and a listener count.

Discord Rich Presence only works over a local IPC socket the browser can't reach, so it comes in two parts: a userscript reads the page, and this bridge forwards what it reads to the Discord desktop app.

## Setup

1. Clone the repo and install the userscript.
2. Create a [Discord app](https://discord.com/developers/applications) and copy its Application ID.
3. Copy `config.example.json` to `config.json` and paste in the Application ID (or set `DISCORD_APP_ID`).
4. Start the bridge and leave it running alongside the Discord desktop app:

```sh
cd wavez-discord-presence
npm install
npm start
```

Open wavez.fm and join a room, your presence updates automatically.

## Display

The first line is the track (`title - artist`); the second is the DJ, falling back to the room name. The room's listener count shows as the "party" size, and the track's own thumbnail is used as the artwork when available. A corner badge marks the source (YouTube/SoundCloud), or shows a red **Live** indicator for live streams. Buttons link to the room and, for YouTube tracks, straight to the video.

## Config

Values live in `config.json`, each overridable by an env var:

| Key | Env var | Default |
| --- | --- | --- |
| `appId` | `DISCORD_APP_ID` |  |
| `port` | `PORT` | `6969` |
| `largeImage` | `LARGE_IMAGE` | wavez logo |

`largeImage` is the fallback artwork (an uploaded Rich Presence asset key or an image URL); the track thumbnail takes precedence when present. To use an uploaded asset, add it under **Rich Presence → Art Assets** in your Discord app and reference its key.

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
