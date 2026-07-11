// Checks the title parser that turns YouTube's "channel + messy title" into artist/track.
// Run: npm test
const assert = require('assert');
const { clean } = require('../presence.js');

/** @param {string} track @param {string} [artist] */
const c = (track, artist) => clean({ track, artist });

// The case that started this: wavez reports the VEVO channel as the artist.
assert.deepStrictEqual(
  c('The Black Eyed Peas - My Humps', 'BlackEyedPeasVEVO'),
  { artist: 'The Black Eyed Peas', track: 'My Humps' });

// SoundCloud uploads come from labels and collectives, not the artist. The title still names
// the artist, and it wins over the uploader.
assert.deepStrictEqual(
  c('Ruby My Dear - Jit Thin', 'The Amen Connection'),
  { artist: 'Ruby My Dear', track: 'Jit Thin' });

// Auto-generated "- Topic" channels are the same problem.
assert.deepStrictEqual(
  c('Crystal Castles - Vanished', 'Crystal Castles - Topic'),
  { artist: 'Crystal Castles', track: 'Vanished' });

// Upload noise is dropped from the track name, whatever the phrasing or bracket style.
assert.deepStrictEqual(
  c('Rick Astley - Never Gonna Give You Up (Official Video)', 'RickAstleyVEVO'),
  { artist: 'Rick Astley', track: 'Never Gonna Give You Up' });
assert.deepStrictEqual(
  c('Radiohead - Creep [Official Audio]', 'Radiohead'),
  { artist: 'Radiohead', track: 'Creep' });
// Extra words inside the brackets must not save it.
assert.deepStrictEqual(
  c('Dua Lipa - Levitating (Official Music Video HD)', 'DuaLipaVEVO'),
  { artist: 'Dua Lipa', track: 'Levitating' });
// Trailing pipe form.
assert.deepStrictEqual(
  c('Tame Impala - The Less I Know The Better | Official Video', 'TameImpalaVEVO'),
  { artist: 'Tame Impala', track: 'The Less I Know The Better' });
// Two junk groups in a row.
assert.deepStrictEqual(
  c('Gorillaz - Feel Good Inc. (Official Video) [4K]', 'GorillazVEVO'),
  { artist: 'Gorillaz', track: 'Feel Good Inc.' });
assert.deepStrictEqual(
  c('Radiohead - Creep (Remastered 2011)', 'Radiohead'),
  { artist: 'Radiohead', track: 'Creep' });

// Brackets that carry real information are NOT noise, and must survive.
assert.deepStrictEqual(
  c('Queen - Bohemian Rhapsody (Live at Wembley)', 'QueenOfficial'),
  { artist: 'Queen', track: 'Bohemian Rhapsody (Live at Wembley)' });
assert.deepStrictEqual(
  c('Daft Punk - Get Lucky (feat. Pharrell Williams)', 'DaftPunkVEVO'),
  { artist: 'Daft Punk', track: 'Get Lucky (feat. Pharrell Williams)' });
// A junk word in the actual title is only junk inside brackets.
assert.deepStrictEqual(
  c('Lana Del Rey - Video Games', 'LanaDelReyVEVO'),
  { artist: 'Lana Del Rey', track: 'Video Games' });

// Already-clean metadata (SoundCloud) must survive untouched.
assert.deepStrictEqual(
  c('A Little Piece Of Heaven', 'Avenged Sevenfold'),
  { artist: 'Avenged Sevenfold', track: 'A Little Piece Of Heaven' });

// No " - " means no split: a hyphenated title stays whole.
assert.deepStrictEqual(
  c('Bohemian Rhapsody', 'Queen'),
  { artist: 'Queen', track: 'Bohemian Rhapsody' });

// A dash with no spaces is part of the title, not a separator.
assert.deepStrictEqual(
  c('Jay-Z', 'Jay-Z'),
  { artist: 'Jay-Z', track: 'Jay-Z' });

// En dash is used as often as a hyphen.
assert.deepStrictEqual(
  c('Daft Punk – Around the World', 'DaftPunkVEVO'),
  { artist: 'Daft Punk', track: 'Around the World' });

// Missing artist entirely: take it from the title.
assert.deepStrictEqual(
  c('Aphex Twin - Xtal', undefined),
  { artist: 'Aphex Twin', track: 'Xtal' });

console.log('clean(): all cases pass');
