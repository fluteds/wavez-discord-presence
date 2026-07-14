// @ts-check
// wavez only sends the video thumbnail, so real cover art is looked up by artist + track.
//
// Last.fm is the better source, but it needs an API key, so it's only used when one is
// configured (a from-source thing). Without a key, iTunes answers unauthenticated and is
// what everyone running `npx` gets. Misses are cached too, so they aren't retried every
// heartbeat, but only for an hour, so a track that gets tagged later can still be found.

const { warn } = require('./log.js');
const config = require('./config.js');

const LASTFM_ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';
// Last.fm answers with a star placeholder rather than nothing when it has no cover.
const LASTFM_PLACEHOLDER_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

const LASTFM_KEY = process.env.LASTFM_API_KEY || config.lastfmKey || '';

/** @typedef {{ art: string | null, artist?: string, match?: string }} Artwork */
// artist: the provider's name for the artist we asked about, only when it agrees, so it is safe to display.
// match: whoever the provider actually answered with, agreeing or not. Only good for asking "which half of this title is the artist?".

/** @param {unknown} value */
const text = (value) => String(value || '').trim();

// Compares names across punctuation, case, and accents, so "Sigur Rós" matches "sigur ros"
// but a genuinely different artist never does.
/** @param {unknown} value */
const identity = (value) => text(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

/** @type {Map<string, { found: Artwork, expiresAt: number }>} */
const cache = new Map();
const CACHE_MAX = 200;
const HIT_TTL = 7 * 86400000;
const MISS_TTL = 3600000;

/** @param {string} key @param {Artwork} found */
function store(key, found) {
  // ponytail: insertion-order eviction, not true LRU. Swap if the hit rate ever matters.
  if (!cache.has(key) && cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { found, expiresAt: Date.now() + (found.art ? HIT_TTL : MISS_TTL) });
  return found;
}

/**
 * @param {string} artist @param {string} title
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Artwork | undefined>} undefined when Last.fm has nothing usable
 */
async function fetchLastFmArtwork(artist, title, { apiKey = LASTFM_KEY, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    method: 'track.getInfo',
    api_key: apiKey,
    artist,
    track: title,
    autocorrect: '1',
    format: 'json',
  });
  const response = await fetchImpl(`${LASTFM_ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const returnedArtist = data?.track?.artist?.name;
  const returnedTitle = data?.track?.name;
  // autocorrect=1 fixes typos, but it also happily answers with a different song. Only trust
  // the result when it's still the track we asked about.
  if ((returnedArtist && identity(returnedArtist) !== identity(artist)) ||
      (returnedTitle && identity(returnedTitle) !== identity(title))) {
    return undefined;
  }

  const images = Array.isArray(data?.track?.album?.image) ? data.track.album.image : [];
  const image = [...images].reverse().find((item) => /^https?:\/\//.test(item?.['#text'] || ''))?.['#text'];
  if (!image || image.includes(LASTFM_PLACEHOLDER_HASH)) return undefined;
  return { art: image.replace(/^http:/, 'https:'), artist: returnedArtist || undefined, match: returnedArtist || undefined };
}

/**
 * @param {string} artist @param {string} title
 * @returns {Promise<Artwork>}
 */
async function fetchItunesArtwork(artist, title) {
  const term = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(`https://itunes.apple.com/search?media=music&limit=1&term=${term}`, {
    signal: AbortSignal.timeout(4000),
  });
  const json = await res.json();
  const top = json?.results?.[0];
  if (!top) return { art: null };

  /** @type {Artwork} */
  const found = { art: top.artworkUrl100?.replace('100x100', '512x512') || null, match: top.artistName || undefined };
  // Take iTunes' casing ("LCD Soundsystem" over "lcdsoundsystem"), but only on the same
  // artist, so a bad match can never relabel the track as someone else.
  if (top.artistName && identity(top.artistName) === identity(artist)) found.artist = top.artistName;
  return found;
}

// Looser than identity(): iTunes answers "Black Eyed Peas" for The Black Eyed Peas, and credits
// "Calvin Harris & Dua Lipa" where the title says one of them. Close enough to tell an artist
// name apart from a song name, which is all this is used for.
/** @param {unknown} a @param {unknown} b */
function sameArtist(a, b) {
  const [x, y] = [identity(a), identity(b)];
  if (!x || !y) return false;
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}
// Full-album rips glue the album onto the artist ("Daft Punk Alive 2007 - Touch It / Technologic").
// The provider knows the real name, so take it when it's only the head of what the title gave us.
// Head only, never a longer credit, so a loose match can't relabel the track as someone else.
/** @param {unknown} match @param {unknown} artist */
function trimsArtist(match, artist) {
  const [m, a] = [identity(match), identity(artist)];
  return m.length >= 4 && m !== a && a.startsWith(m);
}
const BRACKETED_SUFFIX = /\s*[[(][^)\]]*[)\]]\s*$/;

/** @param {string} artist @param {string} track @returns {Promise<Artwork>} */
async function lookup(artist, track) {
  if (LASTFM_KEY) {
    try {
      const lastfm = await fetchLastFmArtwork(artist, track);
      if (lastfm) return lastfm;
    } catch (e) {
      warn('Last.fm lookup failed, falling back to iTunes:', e instanceof Error ? e.message : e);
    }
  }
  return fetchItunesArtwork(artist, track);
}

/**
 * @param {string} [artist] @param {string} [track]
 * @returns {Promise<Artwork>}
 */
async function albumArt(artist, track) {
  if (!artist || !track) return { art: null };

  const key = `${artist.toLowerCase()} ${track.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.found;
  if (hit) cache.delete(key);

  try {
    const found = await lookup(artist, track);
    if (found.art) return store(key, found);

    const bare = track.replace(BRACKETED_SUFFIX, '').trim();
    if (bare && bare !== track) return store(key, await lookup(artist, bare));
    return store(key, found);
  } catch (e) {
    warn('album art lookup failed:', e instanceof Error ? e.message : e);
    return store(key, { art: null });
  }
}

module.exports = { albumArt, fetchLastFmArtwork, sameArtist, trimsArtist, lastfmEnabled: Boolean(LASTFM_KEY) };
