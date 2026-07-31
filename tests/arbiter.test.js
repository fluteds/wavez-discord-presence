// Checks the arbitration that decides which front end drives Discord when both
// a browser tab and wavez-cli are POSTing. Time is injected so staleness is
// deterministic. Run: npm test
const assert = require('assert');
const { Arbiter } = require('../src/arbiter.js');

const STALE = 40000;
const playing = (client) => ({ client, playing: true, paused: false });
const paused = (client) => ({ client, playing: false, paused: true });
const stopped = (client) => ({ client, playing: false, paused: false });

// First to play owns Discord; the other client is locked out while the owner is fresh.
{
  const a = new Arbiter(STALE);
  assert.strictEqual(a.owns(playing('userscript'), 0), true, 'first playing client wins');
  a.touch(0);
  assert.strictEqual(a.owner, 'userscript');
  assert.strictEqual(a.owns(playing('wavez-cli'), 1000), false, 'second client is locked out while owner is fresh');
  assert.strictEqual(a.owner, 'userscript', 'a rejected claim must not change the owner');
}

// A non-owner cannot clear the owner: the CLI sitting outside a room must not wipe a playing tab.
{
  const a = new Arbiter(STALE);
  a.owns(playing('userscript'), 0); a.touch(0);
  assert.strictEqual(a.owns(stopped('wavez-cli'), 500), false, 'non-owner stop is ignored');
  assert.strictEqual(a.owner, 'userscript', 'owner survives a non-owner stop');
}

// Source switching: the owner stopping hands control to the other client on its next post.
{
  const a = new Arbiter(STALE);
  a.owns(playing('userscript'), 0); a.touch(0);
  assert.strictEqual(a.owns(stopped('userscript'), 1000), true, 'owner may release by stopping');
  assert.strictEqual(a.owner, '', 'stopping frees ownership');
  assert.strictEqual(a.owns(playing('wavez-cli'), 1100), true, 'freed ownership is claimable');
  assert.strictEqual(a.owner, 'wavez-cli', 'the CLI now drives Discord');
}

// Pausing releases ownership too (documented behaviour: a paused owner yields).
{
  const a = new Arbiter(STALE);
  a.owns(playing('userscript'), 0); a.touch(0);
  assert.strictEqual(a.owns(paused('userscript'), 1000), true, 'owner may release by pausing');
  assert.strictEqual(a.owner, '');
}

// Stale takeover: once the owner goes quiet past staleMs, the other client wins.
{
  const a = new Arbiter(STALE);
  a.owns(playing('userscript'), 0); a.touch(0);
  assert.strictEqual(a.owns(playing('wavez-cli'), STALE - 1), false, 'still owned just before stale');
  assert.strictEqual(a.owns(playing('wavez-cli'), STALE + 1), true, 'stale owner is displaced');
  assert.strictEqual(a.owner, 'wavez-cli');
}

// isStale drives the reconnect replay and the cleanup interval.
{
  const a = new Arbiter(STALE);
  a.touch(0);
  assert.strictEqual(a.isStale(STALE), false, 'exactly staleMs is not yet stale');
  assert.strictEqual(a.isStale(STALE + 1), true, 'past staleMs is stale');
}

// Rapid track changes from the same owner never lose ownership or flip it away.
{
  const a = new Arbiter(STALE);
  for (let t = 0; t < 20; t++) {
    assert.strictEqual(a.owns(playing('userscript'), t), true, 'owner keeps driving through rapid changes');
    a.touch(t);
    assert.strictEqual(a.owner, 'userscript');
  }
}

// release() frees ownership so a vanished owner (tab closed) is replaced immediately.
{
  const a = new Arbiter(STALE);
  a.owns(playing('userscript'), 0); a.touch(0);
  a.release();
  assert.strictEqual(a.owner, '');
  assert.strictEqual(a.owns(playing('wavez-cli'), 1), true, 'the other client claims a released presence at once');
}

// A status with no client field is treated as the userscript (its documented default).
{
  const a = new Arbiter(STALE);
  assert.strictEqual(a.owns({ playing: true }, 0), true);
  assert.strictEqual(a.owner, 'userscript', 'missing client defaults to userscript');
}

console.log('Arbiter: all cases pass');
