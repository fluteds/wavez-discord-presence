// Starts the real bridge against a port that's already taken and checks it
// fails loudly instead of silently doing nothing. Run: npm test
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'src', 'presence.js');

// Occupy a port, then launch the bridge on it and confirm it exits non-zero
// with the "port is busy" warning rather than starting a second bridge.
const blocker = http.createServer(() => {});
blocker.listen(0, '127.0.0.1', () => {
  const port = blocker.address().port;
  const child = spawn(process.execPath, [SCRIPT], {
    // No Discord app id needed; login runs in parallel and dies with the process.
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));

  // Safety net: the EADDRINUSE path should exit within a second or so.
  const kill = setTimeout(() => child.kill(), 8000);

  child.on('exit', (code) => {
    clearTimeout(kill);
    blocker.close();
    assert.strictEqual(code, 1, `bridge should exit 1 on a busy port, got ${code}`);
    assert.match(stderr, /is busy/, 'bridge should warn that the port is busy');
    console.log('port conflict: bridge exits with a clear error');
  });
});
