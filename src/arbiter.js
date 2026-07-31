// @ts-check
// Which front end drives Discord when a browser tab and wavez-cli both POST.
// Without this they trade Discord back and forth every few seconds, and the one
// sitting outside a room clears the one that's playing. First to play owns it;
// ownership ends when that client stops/pauses or goes quiet for staleMs.
// Pure and time-injectable (pass `now`) so the arbitration can be unit-tested.

class Arbiter {
  /** @param {number} staleMs */
  constructor(staleMs) {
    this.staleMs = staleMs;
    this.owner = '';   // client currently driving Discord; '' = up for grabs
    this.lastSeen = 0; // Date.now() of the owner's last accepted POST
  }

  // True if this status may drive Discord. Claims ownership on a playing status,
  // releases it on a stopped/paused one. A different client is locked out only
  // while the current owner is still fresh.
  /** @param {{ client?: string, playing?: boolean, paused?: boolean } | null} status @param {number} [now] @returns {boolean} */
  owns(status, now = Date.now()) {
    const from = (status && status.client) || 'userscript';
    const held = this.owner && this.owner !== from && now - this.lastSeen < this.staleMs;
    if (held) return false;
    if (status && status.playing && !status.paused) { this.owner = from; return true; }
    this.owner = ''; // this client stopped: let the other one take over on its next post
    return true;
  }

  /** @param {number} [now] Record an accepted POST from the current owner. */
  touch(now = Date.now()) { this.lastSeen = now; }

  /** @param {number} [now] @returns {boolean} No heartbeat within staleMs. */
  isStale(now = Date.now()) { return now - this.lastSeen > this.staleMs; }

  // The owner vanished (tab closed, terminal killed): free it for the other client.
  release() { this.owner = ''; }
}

module.exports = { Arbiter };
