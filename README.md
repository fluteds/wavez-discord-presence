# Wavez Discord Presence

Show what you're listening to on [wavez.fm](https://wavez.fm) as Discord Rich Presence — track, artist, DJ, room, listener count, and a **Join the room** button so friends can drop in.

![license](https://img.shields.io/badge/license-MIT-blue) ![version](https://img.shields.io/badge/version-1.2.0-brightgreen) ![node](https://img.shields.io/badge/node-%3E%3D18-339933)

Discord's Rich Presence only speaks over a local IPC socket, which a browser tab can't touch. So this ships as two halves: a **userscript** that reads the wavez page, and a small **bridge** that relays what it reads into the Discord desktop app.

## Install

You'll need [Node.js](https://nodejs.org) and a userscript manager — [Tampermonkey](https://www.tampermonkey.net) or [Violentmonkey](https://violentmonkey.github.io).

There's no Discord app to register and no config to fill in.

**1. Install the userscript.** Open [wavez-discord-presence.user.js](https://raw.githubusercontent.com/fluteds/wavez-discord-presence/main/wavez-discord-presence.user.js) and your userscript manager will offer to install it.

**2. Run the bridge.**

```sh
git clone https://github.com/fluteds/wavez-discord-presence
cd wavez-discord-presence
npm install
npm start
```

**3. Open wavez.fm and join a room.** Your presence updates on its own.

Leave the bridge running in the background, next to the Discord desktop app. It's the only piece that can actually reach Discord — close the terminal and your presence disappears.

## What it shows

| Presence slot | Filled with |
| --- | --- |
| Line 1 | Track title |
| Line 2 | The DJ |
| Artwork | The track's thumbnail, falling back to the wavez logo |
| Artwork tooltip | Room name and how many others are listening |
| Corner badge | YouTube or SoundCloud, or a red **Live** dot for streams |
| Party size | The room's listener count |
| Progress bar | Track position, from its start time and duration |
| Button | **Join the room** |

Presence clears itself when you pause, when nothing is playing, and when wavez goes quiet for 40 seconds — so leaving the tab won't strand a stale track on your profile.

## Config

**Optional — the defaults work as-is.** Skip this unless something clashes.

Copy `config.example.json` to `config.json` (it's gitignored) and set only the keys you care about. Every key also has an env var, which wins over the file.

| Key | Env var | Default |
| --- | --- | --- |
| `appId` | `DISCORD_APP_ID` | the shared wavez.fm presence app |
| `port` | `PORT` | `6969` |
| `largeImage` | `LARGE_IMAGE` | wavez logo |

**`appId`** — the Discord application your presence appears under. The bundled default is a public identifier, not a secret; application IDs ship inside every Discord client, so sharing one is expected and safe. Point this at your own [Discord app](https://discord.com/developers/applications) only if you want a different app name on your profile.

**`largeImage`** — fallback artwork when a track has no thumbnail. Either an image URL, or the key of an asset you uploaded under **Rich Presence → Art Assets** in your Discord app.

**`port`** — change only if `6969` is taken. If you do, update `BRIDGE` at the top of the userscript to match; both ends have to agree.

## Troubleshooting

**Nothing shows up in Discord.** Check the bridge's terminal. `✅ connected to Discord` means it found the desktop app — if it says Discord is unreachable, you're likely on the web version of Discord, which has no IPC socket and cannot work.

**The bridge says `port 6969 is busy`.** It's already running in another terminal. Either use that one, or set `PORT` and update `BRIDGE` in the userscript to match.

**The bridge never logs anything when you play a track.** The userscript isn't reaching it. Open the browser console on wavez.fm and look for `[wz-presence]` lines; `bridge unreachable` means the bridge isn't running, and no lines at all means the userscript didn't load.

**Your presence is stuck on an old track.** The bridge clears it after 40s without a heartbeat. If wavez is still open, the userscript has probably stopped — reload the tab.

## Contributing

[Conventional Commits](https://www.conventionalcommits.org) (`feat`, `fix`, `chore`, `docs`, `refactor`; scope is usually `bridge` or `userscript`) and [semantic versioning](https://semver.org).

The two halves ship as one unit and share a version, so bump `version` in `package.json` and `@version` in the userscript header together, then tag `vX.Y.Z`. A **major** means the POST payload changed shape and an old userscript can no longer talk to a new bridge. The userscript's `@version` drives Tampermonkey's auto-update check, so it only ever goes up.

## License

[MIT](LICENSE)
