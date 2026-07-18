#!/usr/bin/env node
// @ts-check
// wavez.fm -> Discord Rich Presence bridge. The userscript POSTs room/track here; this forwards it to Discord's IPC socket.

/**
 * @typedef {object} Status
 * @property {boolean} [playing]
 * @property {boolean} [paused]
 * @property {string}  [track]
 * @property {string}  [artist]
 * @property {string}  [dj]
 * @property {string}  [room]
 * @property {string}  [source]
 * @property {string}  [sourceId]
 * @property {number}  [listeners]
 * @property {string}  [image]
 * @property {string}  [url]
 * @property {number}  [startedAt]  - epoch seconds
 * @property {number}  [durationMs]
 * @property {boolean} [isLive]
 */

const http = require('http');
const { Client } = require('@xhayper/discord-rpc');
const config = require('./config.js');
const { trackMetadata } = require('./metadata.js');
const { albumArt, sameArtist, trimsArtist, lastfmEnabled } = require('./artwork.js');
const { log, warn } = require('./log.js');

// Shared wavez.fm Rich Presence app. An application id is a public identifier, not a secret.
const DEFAULT_APP_ID = '1522376776536428655';

const APP_ID = process.env.DISCORD_APP_ID || config.appId || DEFAULT_APP_ID;
const PORT = Number(process.env.PORT) || config.port || 6969;
const SOURCE_BADGES = process.env.SOURCE_BADGES
  ? process.env.SOURCE_BADGES === 'true'
  : config.sourceBadges === true;

// Discord's asset proxy can't decode .ico; Google's favicon service returns a PNG for any domain.
/** @param {string} domain */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
/** @type {Record<string, { name: string, icon: string }>} */
const SOURCES = {
  youtube: { name: 'YouTube', icon: favicon('youtube.com') },
  soundcloud: { name: 'SoundCloud', icon: favicon('soundcloud.com') },
};
const WAVEZ_ICON = favicon('wavez.fm');

// Discord rejects details/state shorter than 2 chars and caps at 128.
/** @param {unknown} s @returns {string | undefined} */
const clamp = (s) => {
  const t = String(s || '').trim().slice(0, 128);
  return t.length >= 2 ? t : undefined;
};

const client = new Client({ clientId: APP_ID });
let ready = false;
/** @type {Status | null} */
let last = null;         // most recent status; replayed when Discord reconnects
let lastSeen = 0;        // Date.now() of the last userscript POST
let cleared = false;
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
  let { artist: parsed, title, ambiguous } = trackMetadata(status);

  const found = await albumArt(parsed, title);
  // "LOVABLE - ELIZA" is song then artist and the channel didn't say. The lookup ignores order, so its credit settles it.
  if (ambiguous && sameArtist(found.match, title) && !sameArtist(found.match, parsed)) {
    [parsed, title] = [String(found.match), parsed];
  }
  if (last !== status) return; // a newer track landed while we were fetching, let it win
  // "Daft Punk Alive 2007" is the artist with the album stuck on. The lookup credits "Daft Punk", so use that.
  const artist = found.artist || (trimsArtist(found.match, parsed) ? String(found.match) : parsed);

  // "Crystal Castles • DJ f5."
  const line2 = [
    artist,
    // status.dj && `DJ ${status.dj}`,
  ].filter(Boolean).join(' • ');
  // "harkach • 5 listeners". Discord renders largeImageText as its own line.
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

  const image = found.art || status.image || process.env.LARGE_IMAGE || config.largeImage || WAVEZ_ICON;
  /** @type {import('@xhayper/discord-rpc').SetActivity} */
  const activity = {
    type: 2, // Listening. Some Discord builds still show "Playing"
    name: clamp(artist) || 'Wavez', // drives the "Listening to ___" header
    details: clamp(title) || 'Listening on wavez.fm',
    state: clamp(line2),
    largeImageText: clamp(line3) || 'wavez.fm',
    largeImageKey: image,
    buttons: buttons.length ? buttons : undefined,
  };
  // No largeImageUrl: that field is a hyperlink on the artwork, not the image source.
  if (SOURCE_BADGES && status.isLive) { activity.smallImageKey = WAVEZ_ICON; activity.smallImageText = 'Live'; }
  else if (SOURCE_BADGES && src) { activity.smallImageKey = src.icon; activity.smallImageText = src.name; }
  else { activity.smallImageKey = WAVEZ_ICON; activity.smallImageText = 'wavez.fm'; }
  if (status.listeners) { activity.partySize = status.listeners; activity.partyMax = status.listeners; }

  if (status.startedAt) {
    activity.startTimestamp = Math.floor(status.startedAt);
    if (status.durationMs && !status.isLive) {
      activity.endTimestamp = Math.floor(status.startedAt + status.durationMs / 1000);
    }
  }

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
  if (last && Date.now() - lastSeen < STALE_MS) apply(last).catch((e) => warn('apply failed:', e.message));
  else client.user?.clearActivity().catch(() => {});
});

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
      warn(`⚠️ Discord unreachable (is the desktop app running?): ${e.message} - retrying in 10s`);
      setTimeout(connect, 10000);
    });
}

// wavez closed: clear the presence once the heartbeat goes stale.
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
}).listen(PORT, () => {
  log(`🎧 wavez presence bridge listening on :${PORT}`);
  log(`🎨 cover art source: ${lastfmEnabled ? 'Last.fm (iTunes on fallback)' : 'iTunes (set lastfmKey to use Last.fm)'}`);
});

connect();
