const assert = require('assert');
const { trackMetadata } = require('../src/metadata.js');

/** @param {string} track @param {string} [artist] */
const yt = (track, artist) => { const { artist: a, title } = trackMetadata({ track, artist, source: 'youtube' }); return { artist: a, title }; };
/** @param {string} track @param {string} [artist] */
const sc = (track, artist) => { const { artist: a, title } = trackMetadata({ track, artist, source: 'soundcloud' }); return { artist: a, title }; };

assert.deepStrictEqual(
  yt('The Black Eyed Peas - My Humps', 'BlackEyedPeasVEVO'),
  { artist: 'The Black Eyed Peas', title: 'My Humps' });
assert.deepStrictEqual(
  yt('Ruby My Dear - Jit Thin', 'The Amen Connection'),
  { artist: 'Ruby My Dear', title: 'Jit Thin' });
assert.deepStrictEqual(
  yt('Crystal Castles - Vanished', 'Crystal Castles - Topic'),
  { artist: 'Crystal Castles', title: 'Vanished' });

assert.deepStrictEqual(
  yt('LOVABLE - ELIZA', 'ELIZA'),
  { artist: 'ELIZA', title: 'LOVABLE' });
assert.deepStrictEqual(
  yt('LOVABLE - ELIZA (Official Video)', 'ELIZA - Topic'),
  { artist: 'ELIZA', title: 'LOVABLE' });

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
assert.deepStrictEqual(
  yt('Radiohead - Creep (Remastered 2011)', 'Radiohead'),
  { artist: 'Radiohead', title: 'Creep (Remastered 2011)' });

assert.deepStrictEqual(
  yt('Queen - Bohemian Rhapsody (Live at Wembley)', 'QueenOfficial'),
  { artist: 'Queen', title: 'Bohemian Rhapsody (Live at Wembley)' });
assert.deepStrictEqual(
  yt('Daft Punk - Get Lucky (feat. Pharrell Williams)', 'DaftPunkVEVO'),
  { artist: 'Daft Punk', title: 'Get Lucky (feat. Pharrell Williams)' });
assert.deepStrictEqual(
  yt('Lana Del Rey - Video Games', 'LanaDelReyVEVO'),
  { artist: 'Lana Del Rey', title: 'Video Games' });
assert.deepStrictEqual(
  yt('Arctic Monkeys - 505 (Official Live Video)', 'ArcticMonkeysVEVO'),
  { artist: 'Arctic Monkeys', title: '505 (Live)' });

assert.deepStrictEqual(
  yt('Daft Punk Alive 2007 - Touch It / Technologic #02', 'concert uploads'),
  { artist: 'Daft Punk Alive 2007', title: 'Touch It / Technologic' });
assert.deepStrictEqual(
  yt('Fiona Apple - Not About Love #1', 'FionaAppleVEVO'),
  { artist: 'Fiona Apple', title: 'Not About Love #1' });
assert.deepStrictEqual(
  yt('Carpenter Brut - Maniac #polandrock2023', 'Pol\'and\'Rock Festival'),
  { artist: 'Carpenter Brut', title: 'Maniac' });
assert.deepStrictEqual(
  yt('Carpenter Brut #polandrock2023 - Maniac #live #2023', 'Pol\'and\'Rock Festival'),
  { artist: 'Carpenter Brut', title: 'Maniac' });
assert.deepStrictEqual(
  yt('The Chainsmokers - #SELFIE', 'ChainsmokersVEVO'),
  { artist: 'The Chainsmokers', title: '#SELFIE' });

assert.deepStrictEqual(
  sc('A Little Piece Of Heaven', 'Avenged Sevenfold'),
  { artist: 'Avenged Sevenfold', title: 'A Little Piece Of Heaven' });
assert.deepStrictEqual(
  sc('Get Down - Extended Mix', 'Fisher'),
  { artist: 'Fisher', title: 'Get Down - Extended Mix' });

assert.deepStrictEqual(
  sc('Avenged Sevenfold - Hail To The King', 'Avenged Sevenfold'),
  { artist: 'Avenged Sevenfold', title: 'Hail To The King' });

assert.deepStrictEqual(
  yt('Bohemian Rhapsody', 'Queen'),
  { artist: 'Queen', title: 'Bohemian Rhapsody' });

assert.deepStrictEqual(
  yt('Aphex Twin - Xtal', undefined),
  { artist: 'Aphex Twin', title: 'Xtal' });

const ambiguity = (/** @type {string} */ track, /** @type {string} */ artist) =>
  trackMetadata({ track, artist, source: 'youtube' }).ambiguous;
assert.strictEqual(ambiguity('Ruby My Dear - Jit Thin', 'The Amen Connection'), true);
assert.strictEqual(ambiguity('LOVABLE - ELIZA', 'ELIZA'), false);
assert.strictEqual(ambiguity('Radiohead - Creep [Official Audio]', 'Radiohead'), false);
assert.strictEqual(ambiguity('Bohemian Rhapsody', 'Queen'), false);

console.log('trackMetadata(): all cases pass');
