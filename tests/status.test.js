const assert = require('assert');
const { normalizeStatus, BadPayload, LIMITS } = require('../src/status.js');

const NOW = 1_750_000_000_000;
const at = (payload) => normalizeStatus(payload, NOW);
const rejects = (payload, pattern) => assert.throws(() => at(payload), (e) => e instanceof BadPayload && pattern.test(e.message), `${JSON.stringify(payload)} should be rejected`);

{
  const status = at({
    client: 'userscript', playing: true, paused: false, isLive: false,
    track: 'Ghostlight', artist: 'Skeler', dj: 'yngk', room: 'Move It! - Brasil',
    source: 'youtube', sourceId: 'dQw4w9WgXcQ', listeners: 6,
    image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    url: 'https://wavez.fm/~/moveit', startedAt: 1_749_999_900, durationMs: 149_000,
  });
  assert.deepStrictEqual(status, {
    client: 'userscript', playing: true, paused: false, isLive: false,
    track: 'Ghostlight', artist: 'Skeler', dj: 'yngk', room: 'Move It! - Brasil',
    source: 'youtube', sourceId: 'dQw4w9WgXcQ', listeners: 6,
    image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    url: 'https://wavez.fm/~/moveit', startedAt: 1_749_999_900, durationMs: 149_000,
  }, 'a valid playback state passes through unchanged');
}

assert.deepStrictEqual(at({ client: 'cli', playing: false, paused: false }), { client: 'cli', playing: false, paused: false });
assert.deepStrictEqual(at({ playing: false, paused: true }), { playing: false, paused: true });
assert.deepStrictEqual(at({}), {}, 'an empty object is a valid "nothing playing"');

assert.deepStrictEqual(at({ playing: true, track: null, artist: null, listeners: null, startedAt: null, image: null, url: null }), { playing: true }, 'nulls are dropped, not rejected');

rejects({ playing: 'yes' }, /playing must be a boolean/);
rejects({ paused: 1 }, /paused must be a boolean/);
rejects({ isLive: 'true' }, /isLive must be a boolean/);
rejects({ track: 42 }, /track must be a string/);
rejects({ track: { toString: 1 } }, /track must be a string/);
rejects({ artist: ['a', 'b'] }, /artist must be a string/);
rejects({ listeners: '6' }, /listeners must be a finite number/);
rejects({ listeners: NaN }, /listeners must be a finite number/);
rejects({ listeners: Infinity }, /listeners must be a finite number/);
rejects({ durationMs: '149000' }, /durationMs must be a finite number/);
rejects({ startedAt: '1749999900' }, /startedAt must be a finite number/);
rejects({ url: 12 }, /url must be a string/);

for (const body of [null, 'string', 42, true, [], [{ playing: true }]]) rejects(body, /body must be a JSON object/);

assert.strictEqual(at({ track: '   Ghostlight   ' }).track, 'Ghostlight');
assert.strictEqual(at({ track: '   ' }).track, undefined, 'whitespace only is absent');
assert.strictEqual(at({ track: 'x'.repeat(5000) }).track.length, LIMITS.track, 'a long title is capped');
assert.strictEqual(at({ room: 'a\u0000b\u0001c\nd' }).room, 'a b c d', 'control characters cannot reach the log or Discord');
assert.strictEqual(at({ source: 'YouTube' }).source, 'youtube', 'source folds to lower case');

assert.strictEqual(at({ listeners: -5 }).listeners, 0, 'a negative count clamps to zero');
assert.strictEqual(at({ listeners: 1e12 }).listeners, LIMITS.listeners, 'an absurd count clamps to the cap');
assert.strictEqual(at({ listeners: 6.7 }).listeners, 7, 'listeners are whole people');
assert.strictEqual(at({ durationMs: 1e15 }).durationMs, LIMITS.durationMs, 'a 30-year track clamps to 24h');
assert.strictEqual(at({ durationMs: -1 }).durationMs, 0);

assert.strictEqual(at({ startedAt: 1_749_999_900 }).startedAt, 1_749_999_900);
assert.strictEqual(at({ startedAt: 0 }).startedAt, undefined, 'the epoch is not a start time');
assert.strictEqual(at({ startedAt: NOW }).startedAt, undefined, 'milliseconds by mistake are dropped, not shown as a year 57000 start');
assert.strictEqual(at({ startedAt: 1_750_000_000 + 86_399 }).startedAt, 1_750_000_000 + 86_399, 'a little clock skew is tolerated');
assert.strictEqual(at({ startedAt: 1_750_000_000 + 999_999 }).startedAt, undefined, 'a far-future start is dropped');
assert.strictEqual(at({ playing: true, track: 'Still fine', startedAt: 5 }).track, 'Still fine', 'a bad timestamp drops itself, not the payload');

assert.strictEqual(at({ url: 'https://wavez.fm/~/room' }).url, 'https://wavez.fm/~/room');
assert.strictEqual(at({ url: 'http://127.0.0.1:6969/presence' }).url, 'http://127.0.0.1:6969/presence');
for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'not a url', '//wavez.fm', 'JavaScript:alert(1)'])
  assert.strictEqual(at({ url: hostile, image: hostile }).url, undefined, `${hostile} must not survive`);
assert.strictEqual(at({ playing: true, track: 'Fine', url: 'javascript:alert(1)' }).track, 'Fine', 'a hostile URL drops itself, not the track');
assert.strictEqual(at({ url: `https://wavez.fm/${'x'.repeat(4000)}` }).url.length, LIMITS.url, 'an overlong URL is capped');

assert.strictEqual(at({ sourceId: 'dQw4w9WgXcQ' }).sourceId, 'dQw4w9WgXcQ');
assert.strictEqual(at({ sourceId: '1234567890' }).sourceId, '1234567890');
for (const junk of ['../../etc/passwd', 'a b', 'x?y=1', '<script>', 'a/b'])
  assert.strictEqual(at({ sourceId: junk }).sourceId, undefined, `${junk} is not an id`);

{
  const status = at(JSON.parse('{"playing":true,"__proto__":{"polluted":true},"constructor":"x","extra":"nope"}'));
  assert.deepStrictEqual(status, { playing: true }, 'only allowlisted keys survive');
  assert.strictEqual({}.polluted, undefined, 'nothing was written to Object.prototype');
  assert.strictEqual(Object.getPrototypeOf(status), Object.prototype);
}

{
  const nested = {};
  let node = nested;
  for (let i = 0; i < 2000; i++) node = (node.next = {});
  rejects({ track: nested }, /track must be a string/);
  assert.strictEqual(at({ playing: true, artist: 'x'.repeat(300) }).artist.length, LIMITS.artist);
}

console.log('status: all cases pass');
