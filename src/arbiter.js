// @ts-check

class Arbiter {
  /** @param {number} staleMs */
  constructor(staleMs) {
    this.staleMs = staleMs;
    this.owner = '';
    this.lastSeen = 0;
  }

  /** @param {{ client?: string, playing?: boolean, paused?: boolean } | null} status @param {number} [now] @returns {boolean} */
  owns(status, now = Date.now()) {
    const from = (status && status.client) || 'userscript';
    const held = this.owner && this.owner !== from && now - this.lastSeen < this.staleMs;
    if (held) return false;
    if (status && status.playing && !status.paused) { this.owner = from; return true; }
    this.owner = '';
    return true;
  }

  /** @param {number} [now] Record an accepted POST from the current owner. */
  touch(now = Date.now()) { this.lastSeen = now; }

  /** @param {number} [now] @returns {boolean} No heartbeat within staleMs. */
  isStale(now = Date.now()) { return now - this.lastSeen > this.staleMs; }

  release() { this.owner = ''; }
}

module.exports = { Arbiter };
