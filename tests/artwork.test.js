// Checks how a Last.fm track.getInfo response is turned into a cover art URL.
// The network is stubbed, so this runs offline and needs no API key.
// Run: npm test
const assert = require('assert');
const { fetchLastFmArtwork, sameArtist } = require('../src/artwork.js');

const PLACEHOLDER = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';

/** Real track.getInfo shape: images ordered small -> mega. @param {object} track */
const respond = (track) => async () => ({ ok: true, json: async () => ({ track }) });
/** @param {number} status */
const fail = (status) => async () => ({ ok: false, status, json: async () => ({}) });

/** @param {string} url */
const images = (url) => [
  { '#text': url.replace('300x300', '34s'), size: 'small' },
  { '#text': url, size: 'extralarge' },
];

(async function main() {
  const ART = 'https://lastfm.freetls.fastly.net/i/u/300x300/realcover.png';
  /** @param {object} track @param {string} [artist] @param {string} [title] */
  const get = (track, artist = 'Radiohead', title = 'Creep') =>
    fetchLastFmArtwork(artist, title, { apiKey: 'k', fetchImpl: respond(track) });
  
  // The largest usable image wins, not the first one listed.
  assert.deepStrictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(ART) } }),
    { art: ART, artist: 'Radiohead', match: 'Radiohead' });
  
  // Last.fm serves art over plain http; Discord's proxy wants https.
  assert.deepStrictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(ART.replace('https:', 'http:')) } }),
    { art: ART, artist: 'Radiohead', match: 'Radiohead' });
  
  // Last.fm returns a star placeholder rather than nothing when it has no cover. That is a miss.
  assert.strictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(PLACEHOLDER) } }),
    undefined);
  
  // A track with no album at all is a miss, not a crash.
  assert.strictEqual(await get({ name: 'Creep', artist: { name: 'Radiohead' } }), undefined);
  assert.strictEqual(await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: [] } }), undefined);
  
  // autocorrect=1 fixes typos, but it will also answer with a different song. Reject those,
  // or we would show the wrong cover with total confidence.
  assert.strictEqual(
    await get({ name: 'Karma Police', artist: { name: 'Radiohead' }, album: { image: images(ART) } }),
    undefined);
  assert.strictEqual(
    await get({ name: 'Creep', artist: { name: 'Stone Temple Pilots' }, album: { image: images(ART) } }),
    undefined);
  
  // Punctuation, case, and accents are not real differences. These are still the right track.
  assert.deepStrictEqual(
    await get({ name: 'Hoppipolla', artist: { name: 'Sigur Rós' }, album: { image: images(ART) } }, 'sigur ros', 'Hoppípolla'),
    { art: ART, artist: 'Sigur Rós', match: 'Sigur Rós' });
  assert.deepStrictEqual(
    await get({ name: 'Get Lucky', artist: { name: 'Daft Punk' }, album: { image: images(ART) } }, 'daft-punk', 'get lucky'),
    { art: ART, artist: 'Daft Punk', match: 'Daft Punk' });
  
  // A dead key throws, so albumArt() can catch it and fall back to iTunes.
  await assert.rejects(
    fetchLastFmArtwork('Radiohead', 'Creep', { apiKey: 'bad', fetchImpl: fail(403) }),
    /HTTP 403/);
  
  // sameArtist() decides which half of "LOVABLE - ELIZA" is the artist, by asking whether the
  // name the provider credited looks like that half. A near miss still counts; a song title never does.
  assert.ok(sameArtist('ELIZA', 'ELIZA'));
  assert.ok(sameArtist('Black Eyed Peas', 'The Black Eyed Peas'));   // iTunes drops the "The"
  assert.ok(sameArtist('Post Malone, Swae Lee', 'Post Malone'));     // credited with the feature
  assert.ok(sameArtist('Sigur Rós', 'sigur ros'));
  assert.ok(!sameArtist('ELIZA', 'LOVABLE'));
  assert.ok(!sameArtist('The Black Eyed Peas', 'My Humps'));
  assert.ok(!sameArtist('', 'Queen'));
  assert.ok(!sameArtist(undefined, 'Queen'));

  console.log('fetchLastFmArtwork(): all cases pass');
})();
