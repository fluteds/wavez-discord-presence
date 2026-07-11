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
const { Client } = require('@xhayper/discord-rpc');

// config.json is optional and gitignored; the defaults below work as-is.
/** @type {{ appId?: string, port?: number, largeImage?: string }} */
let config = {};
try { config = require('./config.json'); } catch { }

// The shared wavez.fm Rich Presence app. An application id is a public identifier
// (it ships inside every Discord client), not a secret, so everyone can use this one.
// Override only to show your own app name/artwork in Discord.
const DEFAULT_APP_ID = '1522376776536428655';

const APP_ID = process.env.DISCORD_APP_ID || config.appId || DEFAULT_APP_ID;
const PORT = Number(process.env.PORT) || config.port || 6969;

// Corner-badge icons. Discord's asset proxy can't decode .ico, so use PNGs.
// Google's favicon service returns a stable PNG for any domain.
/** @param {string} domain */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
/** @type {Record<string, { name: string, icon: string }>} */
const SOURCES = {
  youtube: { name: 'YouTube', icon: favicon('youtube.com') },
  soundcloud: { name: 'SoundCloud', icon: favicon('soundcloud.com') },
};
const LIVE_ICON = favicon('wavez.fm');

// Discord rejects details/state shorter than 2 chars, pad, and caps at 128
/** @param {unknown} s @returns {string | undefined} */
const clamp = (s) => {
  const t = String(s || '').trim().slice(0, 128);
  return t.length >= 2 ? t : undefined;
};

const ts = () => new Date().toTimeString().slice(0, 8);
/** @param {...any} a */ const log = (...a) => console.log(`[${ts()}]`, ...a);
/** @param {...any} a */ const warn = (...a) => console.warn(`[${ts()}]`, ...a);

const client = new Client({ clientId: APP_ID });
let ready = false;
/** @type {Status | null} */
let last = null;         // most recent status; replayed when Discord reconnects
let lastSeen = 0;        // Date.now() of the last userscript POST (heartbeat)
let cleared = false;     // presence already cleared for staleness
let applied = '';        // signature of what's on Discord now, to skip repeat heartbeats
const STALE_MS = 40000;  // no heartbeat this long = wavez closed, clear presence

/** @param {Status} status */
function apply(status) {
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
  const title = status.artist ? `${status.track}` : status.track; // use - ${status.artist} if you want to display artist's name
  const line2 = [
    status.dj && `DJ: ${status.dj}`,
    //status.room && `${status.room}`,
    //status.listeners && `${status.listeners} listening`,
  ].filter(Boolean).join('\n');
  // The API sends no source/sourceId, so infer from the artwork host.
  const img = status.image || '';
  let source = String(status.source || '').toLowerCase();
  if (!source) source = /sndcdn\.com/.test(img) ? 'soundcloud' : /ytimg\.com/.test(img) ? 'youtube' : '';
  const src = SOURCES[source];
  const ytId = status.sourceId || img.match(/ytimg\.com\/vi\/([^/]+)\//)?.[1];
  const srcUrl = source === 'youtube' && ytId ? `https://youtu.be/${ytId}` : null;
  /** @type {{ label: string, url: string }[]} */
  const buttons = [];
  if (url) buttons.push({ label: 'Join the room', url });
  //if (srcUrl) buttons.push({ label: 'Listen on YouTube', url: srcUrl });
  /** @type {import('@xhayper/discord-rpc').SetActivity} */
  const activity = {
    type: 2, // Listening. Some Discord builds still show "Playing"
    details: clamp(title) || 'Listening on wavez.fm',
    state: clamp(line2),
    largeImageText: clamp(status.listeners ? `In ${status.room} with ${status.listeners} other${status.listeners === 1 ? '' : 's'}` : status.room) || 'wavez.fm', // some reason the large image hover text also creates its own line?
    largeImageKey: status.image || process.env.LARGE_IMAGE || config.largeImage || LIVE_ICON,
    buttons: buttons.length ? buttons : undefined,
  };
  if (status.isLive) { activity.smallImageKey = LIVE_ICON; activity.smallImageText = 'Live'; }
  else if (src) { activity.smallImageKey = src.icon; activity.smallImageText = src.name; }
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
  log(`▶  ${activity.details}  |  ${activity.state || '-'}${live}${people}`);
  client.user?.setActivity(activity).catch((e) => { warn('setActivity failed:', e.message); applied = ''; });
}

client.on('ready', () => {
  ready = true;
  applied = ''; // force a re-push after (re)connect
  log(`✅ connected to Discord as ${client.user?.username}`);
  // Replay the latest status, unless wavez has gone quiet, then staus is cleared
  if (last && Date.now() - lastSeen < STALE_MS) apply(last);
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

http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try { apply(JSON.parse(body)); res.writeHead(204).end(); }
    catch (e) { warn('bad POST from userscript:', e instanceof Error ? e.message : e); res.writeHead(400).end('bad json'); }
  });
}).on('error', (e) => {
  // @ts-ignore - code exists on Node's system errors
  if (e.code === 'EADDRINUSE') warn(`⚠️  port ${PORT} is busy - is the bridge already running? Set PORT to use another.`);
  else warn('server error:', e.message);
  process.exit(1);
}).listen(PORT, () => log(`🎧 wavez presence bridge listening on :${PORT}`));

connect();
