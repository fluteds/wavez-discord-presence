const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'src', 'presence.js');

const blocker = http.createServer(() => {});
blocker.listen(0, '127.0.0.1', () => {
  const port = blocker.address().port;
  const child = spawn(process.execPath, [SCRIPT], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));

  const kill = setTimeout(() => child.kill(), 8000);

  child.on('exit', (code) => {
    clearTimeout(kill);
    blocker.close();
    assert.strictEqual(code, 1, `bridge should exit 1 on a busy port, got ${code}`);
    assert.match(stderr, /is busy/, 'bridge should warn that the port is busy');
    console.log('port conflict: bridge exits with a clear error');
  });
});
