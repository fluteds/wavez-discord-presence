// @ts-check

const LIMITS = {
  client: 32,
  track: 256,
  artist: 256,
  dj: 64,
  room: 128,
  source: 32,
  sourceId: 128,
  url: 2048,
  listeners: 1_000_000,
  durationMs: 86_400_000,
};

const EPOCH_FLOOR = 946_684_800;
const FUTURE_SLACK = 86_400;

const CONTROL = /[\u0000-\u001f\u007f]/g;
const ID = /^[\w.:-]{1,128}$/;

class BadPayload extends Error {}

/** @param {string} key @param {unknown} value @param {number} max @returns {string | undefined} */
function str(key, value, max) {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new BadPayload(`${key} must be a string`);
  const text = value.replace(CONTROL, ' ').trim().slice(0, max).trim();
  return text || undefined;
}

/** @param {string} key @param {unknown} value @returns {boolean | undefined} */
function bool(key, value) {
  if (value == null) return undefined;
  if (typeof value !== 'boolean') throw new BadPayload(`${key} must be a boolean`);
  return value;
}

/** @param {string} key @param {unknown} value @param {number} max @returns {number | undefined} */
function count(key, value, max) {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadPayload(`${key} must be a finite number`);
  return Math.min(Math.max(Math.round(value), 0), max);
}

/** @param {string} key @param {unknown} value @returns {string | undefined} */
function url(key, value) {
  const raw = str(key, value, LIMITS.url);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch { return undefined; }
}

/** @param {unknown} value @param {number} [now] @returns {number | undefined} */
function timestamp(value, now = Date.now()) {
  const seconds = count('startedAt', value, Number.MAX_SAFE_INTEGER);
  if (seconds === undefined) return undefined;
  const ceiling = Math.floor(now / 1000) + FUTURE_SLACK;
  return seconds >= EPOCH_FLOOR && seconds <= ceiling ? seconds : undefined;
}

/** @param {unknown} payload @param {number} [now] @returns {import('./presence.js').Status} */
function normalizeStatus(payload, now = Date.now()) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new BadPayload('body must be a JSON object');
  const input = /** @type {Record<string, unknown>} */ (payload);
  const sourceId = str('sourceId', input.sourceId, LIMITS.sourceId);
  /** @type {Record<string, unknown>} */
  const status = {
    client: str('client', input.client, LIMITS.client),
    playing: bool('playing', input.playing),
    paused: bool('paused', input.paused),
    isLive: bool('isLive', input.isLive),
    track: str('track', input.track, LIMITS.track),
    artist: str('artist', input.artist, LIMITS.artist),
    dj: str('dj', input.dj, LIMITS.dj),
    room: str('room', input.room, LIMITS.room),
    source: str('source', input.source, LIMITS.source)?.toLowerCase(),
    sourceId: sourceId && ID.test(sourceId) ? sourceId : undefined,
    listeners: count('listeners', input.listeners, LIMITS.listeners),
    durationMs: count('durationMs', input.durationMs, LIMITS.durationMs),
    startedAt: timestamp(input.startedAt, now),
    image: url('image', input.image),
    url: url('url', input.url),
  };
  for (const key of Object.keys(status)) if (status[key] === undefined) delete status[key];
  return status;
}

module.exports = { normalizeStatus, BadPayload, LIMITS };
