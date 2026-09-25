const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'src', 'presence.js');
const external = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);

const post = (host, port) => new Promise((resolve) => {
  const body = JSON.stringify({ playing: false, paused: false });
  const req = http.request({ host, port, path: '/presence', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
    res.resume();
    res.on('end', () => resolve({ status: res.statusCode }));
  });
  req.on('error', (err) => resolve({ error: err.code ?? err.message }));
  req.end(body);
});

const free = () => new Promise((resolve) => {
  const probe = http.createServer(() => {});
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function main() {
  const port = await free();
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bridge did not start in 10s')), 10000);
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`bridge exited with ${code} before listening`)); });
    });

    assert.strictEqual((await post('127.0.0.1', port)).status, 204, 'the bridge answers on loopback');
    for (const host of external) {
      const { error } = await post(host, port);
      assert.ok(error, `${host}:${port} must not be reachable, got a response instead`);
      assert.match(error, /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/, `unexpected failure from ${host}: ${error}`);
    }
    console.log(external.length ? `bind: loopback only, refused on ${external.join(', ')}` : 'bind: loopback answers (no external address on this host to check against)');
  } finally {
    child.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
