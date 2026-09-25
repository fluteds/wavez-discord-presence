#!/usr/bin/env node
// @ts-check

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
 * @property {string}  [client]  - which front end sent this; absent means the userscript
 */

const { Client } = require('@xhayper/discord-rpc');
const config = require('./config.js');
const { trackMetadata } = require('./metadata.js');
const { albumArt, sameArtist, trimsArtist, lastfmEnabled } = require('./artwork.js');
const { Arbiter } = require('./arbiter.js');
const { createBridgeServer } = require('./server.js');
const { log, warn } = require('./log.js');

const DEFAULT_APP_ID = '1522376776536428655';

const APP_ID = process.env.DISCORD_APP_ID || config.appId || DEFAULT_APP_ID;
const PORT = Number(process.env.PORT) || config.port || 6969;
const SOURCE_BADGES = process.env.SOURCE_BADGES
  ? process.env.SOURCE_BADGES === 'true'
  : config.sourceBadges === true;
const TOKEN = process.env.WAVEZ_BRIDGE_TOKEN || config.token || '';

/** @param {string} domain */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
/** @type {Record<string, { name: string, icon: string }>} */
const SOURCES = {
  youtube: { name: 'YouTube', icon: favicon('youtube.com') },
  soundcloud: { name: 'SoundCloud', icon: favicon('soundcloud.com') },
};
const WAVEZ_ICON = favicon('wavez.fm');

/** @param {unknown} s @returns {string | undefined} */
const clamp = (s) => {
  const t = String(s || '').trim().slice(0, 128);
  return t.length >= 2 ? t : undefined;
};

const client = new Client({ clientId: APP_ID });
let ready = false;
/** @type {Status | null} */
let last = null;
let cleared = false;
let applied = '';
const STALE_MS = 40000;
const arbiter = new Arbiter(STALE_MS);

/** @param {Status} status */
async function apply(status) {
  const prevOwner = arbiter.owner;
  if (!arbiter.owns(status)) return;
  if (arbiter.owner && arbiter.owner !== prevOwner) log(`🎛  presence from ${arbiter.owner}`);
  last = status; arbiter.touch(); cleared = false;
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
  if (ambiguous && sameArtist(found.match, title) && !sameArtist(found.match, parsed)) {
    [parsed, title] = [String(found.match), parsed];
  }
  if (last !== status) return;
  const artist = found.artist || (trimsArtist(found.match, parsed) ? String(found.match) : parsed);

  const line2 = [
    artist,
  ].filter(Boolean).join(' • ');
  const line3 = [
    status.room,
    status.listeners && `${status.listeners} listener${status.listeners === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' • ');
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
    type: 2,
    name: clamp(artist) || 'Wavez',
    details: clamp(title) || 'Listening on wavez.fm',
    state: clamp(line2),
    largeImageText: clamp(line3) || 'wavez.fm',
    largeImageKey: image,
    buttons: buttons.length ? buttons : undefined,
  };
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
  applied = '';
  log(`✅ connected to Discord as ${client.user?.username}`);
  if (last && !arbiter.isStale()) apply(last).catch((e) => warn('apply failed:', e.message));
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
      client.removeAllListeners('connected');
      // @ts-ignore - private, but nothing else resets it
      client.connectionPromise = undefined;
      warn(`⚠️ Discord unreachable (is the desktop app running?): ${e.message} - retrying in 10s`);
      setTimeout(connect, 10000);
    });
}

setInterval(() => {
  if (!ready) return;
  if (last && !arbiter.isStale()) return;
  if (cleared) return;
  const gone = Math.round((Date.now() - arbiter.lastSeen) / 1000);
  log(`💤 no heartbeat from wavez for ${gone}s - discord presence cleared`);
  client.user?.clearActivity().catch((e) => warn('clearActivity failed:', e.message));
  applied = 'clear';
  cleared = true;
  arbiter.release();
}, 15000);

createBridgeServer({
  token: TOKEN,
  onStatus: (status) => { apply(status).catch((e) => warn('apply failed:', e.message)); },
}).on('error', (e) => {
  // @ts-ignore - code exists on Node's system errors
  if (e.code === 'EADDRINUSE') warn(`⚠️  port ${PORT} is busy - is the bridge already running? Set PORT to use another.`);
  else warn('server error:', e.message);
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => {
  log(`🎧 wavez presence bridge listening on http://127.0.0.1:${PORT}/presence`);
  if (TOKEN) log('🔒 token required on every POST (x-wavez-token)');
  log(`🎨 cover art source: ${lastfmEnabled ? 'Last.fm (iTunes on fallback)' : 'iTunes (set lastfmKey to use Last.fm)'}`);
});

connect();
