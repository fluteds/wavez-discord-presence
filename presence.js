#!/usr/bin/env node
// @ts-check
// wavez.fm -> Discord Rich Presence bridge.
// The browser can't reach Discord's IPC socket, so the userscript POSTs the current room/track here and this local process forwards it to Discord.

/**
 * Payload POSTed by the userscript. All fields optional; `playing: false` clears the presence.
 * @typedef {object} Status
 * @property {boolean} [playing] - player state
 * @property {boolean} [paused] - player state
 * @property {string}  [track] - song title
 * @property {string}  [artist] - song artist
 * @property {string}  [dj] - current playing dj name
 * @property {string}  [room] - room name
 * @property {string}  [source] - 'youtube' | 'soundcloud' (any casing)
 * @property {string}  [sourceId] - url of the source
 * @property {number}  [listeners] - how many listeners
 * @property {string}  [image]
 * @property {string}  [url]
 * @property {number}  [startedAt]  - epoch seconds
 * @property {number}  [durationMs] - epoch duration
 * @property {boolean} [isLive] - if it's a livestream
 */

const http = require('http');
const path = require('path');
const { Client } = require('@xhayper/discord-rpc');

// config.json is optional; the defaults below work as-is.
// Resolved from the working directory, not __dirname: under `npx` the script runs
// from npm's cache, and the user's config.json is wherever they invoked it.
/** @type {{ appId?: string, port?: number, largeImage?: string, sourceBadges?: boolean }} */
let config = {};
try { config = require(path.resolve(process.cwd(), 'config.json')); } catch { }

// The shared wavez.fm Rich Presence app. An application id is a public identifier (it ships inside every Discord client), not a secret, so everyone can use this one. Override only to show your own app name/artwork in Discord.
const DEFAULT_APP_ID = '1522376776536428655';

const APP_ID = process.env.DISCORD_APP_ID || config.appId || DEFAULT_APP_ID;
const PORT = Number(process.env.PORT) || config.port || 6969;
// Corner badge: wavez logo by default, or the YouTube/SoundCloud (and Live) badge when on.
const SOURCE_BADGES = process.env.SOURCE_BADGES
  ? process.env.SOURCE_BADGES === 'true'
  : config.sourceBadges === true;

// Corner-badge icons. Discord's asset proxy can't decode .ico, so use PNGs.
// Google's favicon service returns a stable PNG for any domain.
/** @param {string} domain */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
/** @type {Record<string, { name: string, icon: string }>} */
const SOURCES = {
  youtube: { name: 'YouTube', icon: favicon('youtube.com') },
  soundcloud: { name: 'SoundCloud', icon: favicon('soundcloud.com') },
};
const WAVEZ_ICON = favicon('wavez.fm');

// Discord rejects details/state shorter than 2 chars, pad, and caps at 128
/** @param {unknown} s @returns {string | undefined} */
const clamp = (s) => {
  const t = String(s || '').trim().slice(0, 128);
  return t.length >= 2 ? t : undefined;
};

// YouTube titles carry the real metadata ("The Black Eyed Peas - My Humps") while wavez's
// `artist` is just the uploading channel ("BlackEyedPeasVEVO"). Split the title when it looks
// like "artist - track" and drop the upload noise, so the card reads like a music player.
// Upload noise, not metadata. Matched by keyword rather than exact phrasing, so "(Official
// Music Video HD)" goes too. A bracket group with no keyword ("(Live at Wembley)", "(feat. X)")
// is real information and survives.
const JUNK = /official|lyrics?|visuali[sz]er|audio|video|hd|hq|[48]k|remaster(?:ed)?|explicit|uncensored|full album|mv/i;
const BRACKETS = /\s*[([{][^()[\]{}]*[)\]}]/g;
const PIPE = /\s*[|｜][^|｜]*$/;
const CHANNEL = /(?:VEVO$|\s*-\s*Topic$|official$)/i;
/** @param {string} title */
const denoise = (title) => title
  .replace(BRACKETS, (m) => (JUNK.test(m) ? ' ' : m))   // "(Official Video)" -> gone
  .replace(PIPE, (m) => (JUNK.test(m) ? '' : m))        // "| Official Video" -> gone
  .replace(/\s{2,}/g, ' ')
  .trim();
/** @param {Status} s @returns {{ artist?: string, track?: string }} */
function clean(s) {
  const title = denoise(String(s.track || ''));
  let artist = String(s.artist || '').trim();
  // " - " is the near-universal YouTube convention. en/em dashes count too.
  const split = title.match(/^(.{1,80}?)\s+[-–—]\s+(.+)$/);
  if (split) {
    const [, left, right] = split;
    // The title names the artist ("Ruby My Dear - Jit Thin"); `artist` is only whoever uploaded
    // it, which on SoundCloud is often a label or collective ("The Amen Connection"). When the
    // title splits, it wins.
    return { artist: left.trim(), track: right.trim() };
  }
  return { artist: CHANNEL.test(artist) ? artist.replace(CHANNEL, '').trim() : artist, track: title };
}

const ts = () => new Date().toTimeString().slice(0, 8);
/** @param {...any} a */ const log = (...a) => console.log(`[${ts()}]`, ...a);
/** @param {...any} a */ const warn = (...a) => console.warn(`[${ts()}]`, ...a);

// wavez only sends the video thumbnail, so real cover art is looked up on iTunes
// (no key, no account). Misses are cached too, so a miss isn't retried every heartbeat.
/** @type {Map<string, { art: string | null, artist?: string }>} */
const artCache = new Map();
// Same artist modulo case, spacing and punctuation: "lcdsoundsystem" == "LCD Soundsystem".
/** @param {string} s */
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param {string} [artist] @param {string} [track]
 * @returns {Promise<{ art: string | null, artist?: string }>}
 */
async function albumArt(artist, track) {
  if (!artist || !track) return { art: null };
  const key = `${artist} - ${track}`.toLowerCase();
  const hit = artCache.get(key);
  if (hit !== undefined) return hit;

  /** @type {{ art: string | null, artist?: string }} */
  let found = { art: null };
  try {
    const term = encodeURIComponent(`${artist} ${track}`);
    const res = await fetch(`https://itunes.apple.com/search?media=music&limit=1&term=${term}`, {
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    const top = json?.results?.[0];
    if (top) {
      // artworkUrl100 is size-templated; swap in a resolution Discord won't upscale.
      found.art = top.artworkUrl100?.replace('100x100', '512x512') || null;
      // Channel handles arrive as "lcdsoundsystem". Take iTunes' casing, but only when it's
      // the same artist, so a bad match can never relabel the track as someone else.
      if (top.artistName && squash(top.artistName) === squash(artist)) found.artist = top.artistName;
    }
  } catch (e) {
    warn('album art lookup failed:', e instanceof Error ? e.message : e);
  }
  artCache.set(key, found);
  return found;
}

const client = new Client({ clientId: APP_ID });
let ready = false;
/** @type {Status | null} */
let last = null;         // most recent status; replayed when Discord reconnects
let lastSeen = 0;        // Date.now() of the last userscript POST (heartbeat)
let cleared = false;     // presence already cleared for staleness
let applied = '';        // signature of what's on Discord now, to skip repeat heartbeats
const STALE_MS = 40000;  // no heartbeat this long = wavez closed, clear presence

/** @param {Status} status */
async function apply(status) {
  last = status; lastSeen = Date.now(); cleared = false;
  if (!ready) {
    if (applied !== 'queued') { log('⏳ queued - waiting for Discord'); applied = 'queued'; }
    return;
  }

  if (!status || !status.playing || status.paused) {
    if (applied !== 'clear') { log(status?.paused ? '⏸  paused - presence cleared' : '⏹  nothing playing - presence cleared'); applied = 'clear'; }
    client.user?.clearActivity().catch((e) => warn('clearActivity failed:', e.message));
    return;
  }

  const url = /^https?:\/\//.test(status.url || '') ? status.url : null;
  const { artist: parsed, track: title } = clean(status);

  // Cover art and the properly-cased artist. Cached, so this only hits the network on a new track.
  const found = await albumArt(parsed, title);
  if (last !== status) return; // a newer track landed while we were fetching, let it win
  const artist = found.artist || parsed;

  // Line 2: "Crystal Castles • DJ f5."
  const line2 = [
    artist,
    status.dj && `DJ ${status.dj}`,
  ].filter(Boolean).join(' • ');
  // Line 3: "harkach • 5 listeners". Discord renders largeImageText as its own line.
  const line3 = [
    status.room,
    status.listeners && `${status.listeners} listener${status.listeners === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' • ');
  // The API sends no source/sourceId, so infer from the artwork host.
  const img = status.image || '';
  let source = String(status.source || '').toLowerCase();
  if (!source) source = /sndcdn\.com/.test(img) ? 'soundcloud' : /ytimg\.com/.test(img) ? 'youtube' : '';
  const src = SOURCES[source];
  const ytId = status.sourceId || img.match(/ytimg\.com\/vi\/([^/]+)\//)?.[1];
  const srcUrl = source === 'youtube' && ytId ? `https://youtu.be/${ytId}` : null;
  /** @type {{ label: string, url: string }[]} */
  const buttons = [];
  if (url) buttons.push({ label: 'Join room', url });
  //if (srcUrl) buttons.push({ label: 'Listen on YouTube', url: srcUrl });

  // Cover art beats the video thumbnail.
  const image = found.art || status.image || process.env.LARGE_IMAGE || config.largeImage || WAVEZ_ICON;
  /** @type {import('@xhayper/discord-rpc').SetActivity} */
  const activity = {
    type: 2, // Listening. Some Discord builds still show "Playing"
    // Drives the "Listening to ___" header. Falls back to the app name when there's no artist.
    name: clamp(artist) || 'Wavez',
    details: clamp(title) || 'Listening on wavez.fm',
    state: clamp(line2),
    largeImageText: clamp(line3) || 'wavez.fm',
    largeImageKey: image,
    buttons: buttons.length ? buttons : undefined,
  };
  // No largeImageUrl: that field is a hyperlink on the artwork, not the image source, and it
  // makes the cover clickable. largeImageKey takes the URL directly.
  // Corner badge: wavez by default. Set sourceBadges to show YouTube/SoundCloud (and Live) instead.
  if (SOURCE_BADGES && status.isLive) { activity.smallImageKey = WAVEZ_ICON; activity.smallImageText = 'Live'; }
  else if (SOURCE_BADGES && src) { activity.smallImageKey = src.icon; activity.smallImageText = src.name; }
  else { activity.smallImageKey = WAVEZ_ICON; activity.smallImageText = 'wavez.fm'; }
  if (status.listeners) { activity.partySize = status.listeners; activity.partyMax = status.listeners; }

  // startedAt
  if (status.startedAt) {
    activity.startTimestamp = Math.floor(status.startedAt);
    if (status.durationMs && !status.isLive) {
      activity.endTimestamp = Math.floor(status.startedAt + status.durationMs / 1000);
    }
  }

  // Heartbeats
  const sig = JSON.stringify(activity);
  if (sig === applied) return;
  applied = sig;
  const live = status.isLive ? ' • LIVE' : '';
  const people = status.listeners ? ` • ${status.listeners} listening` : '';
  const cover = found.art ? 'cover art' : status.image ? 'thumbnail' : 'wavez logo';
  log(`▶  ${activity.details}  |  ${activity.state || '-'}${live}${people}  [${cover}]`);
  client.user?.setActivity(activity).catch((e) => { warn('setActivity failed:', e.message); applied = ''; });
}

client.on('ready', () => {
  ready = true;
  applied = ''; // force a re-push after (re)connect
  log(`✅ connected to Discord as ${client.user?.username}`);
  // Replay the latest status, unless wavez has gone quiet, then staus is cleared
  if (last && Date.now() - lastSeen < STALE_MS) apply(last).catch((e) => warn('apply failed:', e.message));
  else client.user?.clearActivity().catch(() => {});
});

// Discord closed
client.on('disconnected', () => {
  if (!ready) return;
  ready = false;
  warn('🔌 Discord disconnected - reconnecting when it comes back');
  connect();
});

let connecting = false;
function connect() {
  if (ready || connecting) return;
  connecting = true;
  client.login()
    .then(() => { connecting = false; })
    .catch((e) => {
      connecting = false;
      warn(`⚠️  Discord unreachable (is the desktop app running?): ${e.message} - retrying in 10s`);
      setTimeout(connect, 10000);
    });
}

// Wavez closed
setInterval(() => {
  if (!ready) return;
  if (last && Date.now() - lastSeen <= STALE_MS) return;
  if (cleared) return;
  const gone = Math.round((Date.now() - lastSeen) / 1000);
  log(`💤 no heartbeat from wavez for ${gone}s - discord presence cleared`);
  client.user?.clearActivity().catch((e) => warn('clearActivity failed:', e.message));
  applied = 'clear';
  cleared = true;
}, 15000);

// Only run the bridge when invoked directly, so test-clean.js can require the parser.
if (require.main === module) {
  http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { apply(JSON.parse(body)).catch((e) => warn('apply failed:', e.message)); res.writeHead(204).end(); }
      catch (e) { warn('bad POST from userscript:', e instanceof Error ? e.message : e); res.writeHead(400).end('bad json'); }
    });
  }).on('error', (e) => {
    // @ts-ignore - code exists on Node's system errors
    if (e.code === 'EADDRINUSE') warn(`⚠️  port ${PORT} is busy - is the bridge already running? Set PORT to use another.`);
    else warn('server error:', e.message);
    process.exit(1);
  }).listen(PORT, () => log(`🎧 wavez presence bridge listening on :${PORT}`));

  connect();
}

module.exports = { clean };
