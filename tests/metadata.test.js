// Checks the title parser that turns YouTube's "channel + messy title" into artist/track.
// Run: npm test
const assert = require('assert');
const { trackMetadata } = require('../src/metadata.js');

// The split is YouTube-only, where the uploader is a channel. On SoundCloud a dash is just a dash.
// `ambiguous` is asserted on its own below, so the name cases stay readable.
/** @param {string} track @param {string} [artist] */
const yt = (track, artist) => { const { artist: a, title } = trackMetadata({ track, artist, source: 'youtube' }); return { artist: a, title }; };
/** @param {string} track @param {string} [artist] */
const sc = (track, artist) => { const { artist: a, title } = trackMetadata({ track, artist, source: 'soundcloud' }); return { artist: a, title }; };

// Uploader is a channel, not the artist. The title wins.
assert.deepStrictEqual(
  yt('The Black Eyed Peas - My Humps', 'BlackEyedPeasVEVO'),
  { artist: 'The Black Eyed Peas', title: 'My Humps' });
assert.deepStrictEqual(
  yt('Ruby My Dear - Jit Thin', 'The Amen Connection'),
  { artist: 'Ruby My Dear', title: 'Jit Thin' });
assert.deepStrictEqual(
  yt('Crystal Castles - Vanished', 'Crystal Castles - Topic'),
  { artist: 'Crystal Castles', title: 'Vanished' });

// Some uploads are "Song - Artist". The channel name says which half is the artist.
assert.deepStrictEqual(
  yt('LOVABLE - ELIZA', 'ELIZA'),
  { artist: 'ELIZA', title: 'LOVABLE' });
assert.deepStrictEqual(
  yt('LOVABLE - ELIZA (Official Video)', 'ELIZA - Topic'),
  { artist: 'ELIZA', title: 'LOVABLE' });

// Upload noise is dropped, whatever the phrasing or bracket style.
assert.deepStrictEqual(
  yt('Rick Astley - Never Gonna Give You Up (Official Video)', 'RickAstleyVEVO'),
  { artist: 'Rick Astley', title: 'Never Gonna Give You Up' });
assert.deepStrictEqual(
  yt('Radiohead - Creep [Official Audio]', 'Radiohead'),
  { artist: 'Radiohead', title: 'Creep' });
assert.deepStrictEqual(
  yt('Dua Lipa - Levitating (Official Music Video HD)', 'DuaLipaVEVO'),
  { artist: 'Dua Lipa', title: 'Levitating' });
assert.deepStrictEqual(
  yt('Tame Impala - The Less I Know The Better | Official Video', 'TameImpalaVEVO'),
  { artist: 'Tame Impala', title: 'The Less I Know The Better' });
assert.deepStrictEqual(
  yt('Gorillaz - Feel Good Inc. (Official Video) [4K]', 'GorillazVEVO'),
  { artist: 'Gorillaz', title: 'Feel Good Inc.' });
// Promo tags are not always English.
assert.deepStrictEqual(
  yt("ROZEDALE - Ce soir je t'aime (Clip officiel)", 'ROZEDALE'),
  { artist: 'ROZEDALE', title: "Ce soir je t'aime" });
assert.deepStrictEqual(
  yt('Ado - うっせぇわ (公式ミュージックビデオ)', 'Ado'),
  { artist: 'Ado', title: 'うっせぇわ' });
assert.deepStrictEqual(
  yt('NewJeans - Ditto (공식 영상)', 'HYBE LABELS'),
  { artist: 'NewJeans', title: 'Ditto' });
assert.deepStrictEqual(
  yt('Кино - Группа крови (Официальный клип)', 'Kino'),
  { artist: 'Кино', title: 'Группа крови' });
// A remaster year is a real edition, not upload noise, so it stays.
assert.deepStrictEqual(
  yt('Radiohead - Creep (Remastered 2011)', 'Radiohead'),
  { artist: 'Radiohead', title: 'Creep (Remastered 2011)' });

// Brackets carrying real information survive.
assert.deepStrictEqual(
  yt('Queen - Bohemian Rhapsody (Live at Wembley)', 'QueenOfficial'),
  { artist: 'Queen', title: 'Bohemian Rhapsody (Live at Wembley)' });
assert.deepStrictEqual(
  yt('Daft Punk - Get Lucky (feat. Pharrell Williams)', 'DaftPunkVEVO'),
  { artist: 'Daft Punk', title: 'Get Lucky (feat. Pharrell Williams)' });
// A junk word is only junk inside brackets.
assert.deepStrictEqual(
  yt('Lana Del Rey - Video Games', 'LanaDelReyVEVO'),
  { artist: 'Lana Del Rey', title: 'Video Games' });
// An official live video is a live take, not upload noise.
assert.deepStrictEqual(
  yt('Arctic Monkeys - 505 (Official Live Video)', 'ArcticMonkeysVEVO'),
  { artist: 'Arctic Monkeys', title: '505 (Live)' });

// Full-album rips number their tracks. The album stuck to the artist is left for the lookup to trim.
assert.deepStrictEqual(
  yt('Daft Punk Alive 2007 - Touch It / Technologic #02', 'concert uploads'),
  { artist: 'Daft Punk Alive 2007', title: 'Touch It / Technologic' });
// A single digit is part of the song's name, not an index.
assert.deepStrictEqual(
  yt('Fiona Apple - Not About Love #1', 'FionaAppleVEVO'),
  { artist: 'Fiona Apple', title: 'Not About Love #1' });

// Already-clean metadata (SoundCloud) survives untouched, dash and all.
assert.deepStrictEqual(
  sc('A Little Piece Of Heaven', 'Avenged Sevenfold'),
  { artist: 'Avenged Sevenfold', title: 'A Little Piece Of Heaven' });
assert.deepStrictEqual(
  sc('Get Down - Extended Mix', 'Fisher'),
  { artist: 'Fisher', title: 'Get Down - Extended Mix' });

// A leading artist name is dropped from the title rather than doubled up.
assert.deepStrictEqual(
  sc('Avenged Sevenfold - Hail To The King', 'Avenged Sevenfold'),
  { artist: 'Avenged Sevenfold', title: 'Hail To The King' });

// No " - " means no split.
assert.deepStrictEqual(
  yt('Bohemian Rhapsody', 'Queen'),
  { artist: 'Queen', title: 'Bohemian Rhapsody' });

// Missing artist entirely: take it from the title.
assert.deepStrictEqual(
  yt('Aphex Twin - Xtal', undefined),
  { artist: 'Aphex Twin', title: 'Xtal' });

// A channel that matches neither half leaves the order unproven, so presence.js checks it against the artwork lookup.
const ambiguity = (/** @type {string} */ track, /** @type {string} */ artist) =>
  trackMetadata({ track, artist, source: 'youtube' }).ambiguous;
assert.strictEqual(ambiguity('Ruby My Dear - Jit Thin', 'The Amen Connection'), true);
assert.strictEqual(ambiguity('LOVABLE - ELIZA', 'ELIZA'), false);
assert.strictEqual(ambiguity('Radiohead - Creep [Official Audio]', 'Radiohead'), false);
assert.strictEqual(ambiguity('Bohemian Rhapsody', 'Queen'), false);

console.log('trackMetadata(): all cases pass');
