const assert = require('assert');
const { fetchLastFmArtwork, sameArtist, trimsArtist } = require('../src/artwork.js');

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

  assert.deepStrictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(ART) } }),
    { art: ART, artist: 'Radiohead', match: 'Radiohead' });

  assert.deepStrictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(ART.replace('https:', 'http:')) } }),
    { art: ART, artist: 'Radiohead', match: 'Radiohead' });

  assert.strictEqual(
    await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: images(PLACEHOLDER) } }),
    undefined);

  assert.strictEqual(await get({ name: 'Creep', artist: { name: 'Radiohead' } }), undefined);
  assert.strictEqual(await get({ name: 'Creep', artist: { name: 'Radiohead' }, album: { image: [] } }), undefined);

  assert.strictEqual(
    await get({ name: 'Karma Police', artist: { name: 'Radiohead' }, album: { image: images(ART) } }),
    undefined);
  assert.strictEqual(
    await get({ name: 'Creep', artist: { name: 'Stone Temple Pilots' }, album: { image: images(ART) } }),
    undefined);

  assert.deepStrictEqual(
    await get({ name: 'Hoppipolla', artist: { name: 'Sigur Rós' }, album: { image: images(ART) } }, 'sigur ros', 'Hoppípolla'),
    { art: ART, artist: 'Sigur Rós', match: 'Sigur Rós' });
  assert.deepStrictEqual(
    await get({ name: 'Get Lucky', artist: { name: 'Daft Punk' }, album: { image: images(ART) } }, 'daft-punk', 'get lucky'),
    { art: ART, artist: 'Daft Punk', match: 'Daft Punk' });

  await assert.rejects(
    fetchLastFmArtwork('Radiohead', 'Creep', { apiKey: 'bad', fetchImpl: fail(403) }),
    /HTTP 403/);

  assert.ok(sameArtist('ELIZA', 'ELIZA'));
  assert.ok(sameArtist('Black Eyed Peas', 'The Black Eyed Peas'));
  assert.ok(sameArtist('Post Malone, Swae Lee', 'Post Malone'));
  assert.ok(sameArtist('Sigur Rós', 'sigur ros'));
  assert.ok(!sameArtist('ELIZA', 'LOVABLE'));
  assert.ok(!sameArtist('The Black Eyed Peas', 'My Humps'));
  assert.ok(!sameArtist('', 'Queen'));
  assert.ok(!sameArtist(undefined, 'Queen'));

  assert.ok(trimsArtist('Daft Punk', 'Daft Punk Alive 2007'));
  assert.ok(!trimsArtist('Daft Punk', 'Daft Punk'));
  assert.ok(!trimsArtist('Calvin Harris & Dua Lipa', 'Calvin Harris'));
  assert.ok(!trimsArtist('Beatles', 'The Beatles'));
  assert.ok(!trimsArtist('MGMT', 'Justice'));
  assert.ok(!trimsArtist('', 'Queen'));

  console.log('fetchLastFmArtwork(): all cases pass');
})();
