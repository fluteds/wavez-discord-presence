const assert = require('assert');
const http = require('http');
const { createBridgeServer, MAX_BODY, TOKEN_HEADER } = require('../src/server.js');

const VALID = { client: 'userscript', playing: true, paused: false, track: 'Ghostlight', artist: 'Skeler', room: 'harkach', listeners: 6, url: 'https://wavez.fm/~/harkach' };

const quiet = () => { const real = console.warn; console.warn = () => {}; return () => { console.warn = real; }; };

function listen(options) {
  const seen = [];
  const server = createBridgeServer({ onStatus: (status) => seen.push(status), ...options });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

function request({ port, path = '/presence', method = 'POST', headers = {}, body = '', chunked = false }) {
  return new Promise((resolve, reject) => {
    const sent = typeof body === 'string' ? Buffer.from(body) : body;
    const base = { 'content-type': 'application/json' };
    if (!chunked) base['content-length'] = String(sent.length);
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { ...base, ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(sent.length ? sent : undefined);
  });
}

async function main() {
  const restore = quiet();
  const { server, seen, port } = await listen({});
  const post = (body, extra = {}) => request({ port, body: typeof body === 'string' ? body : JSON.stringify(body), ...extra });

  {
    const res = await post(VALID);
    assert.strictEqual(res.status, 204, 'a valid POST /presence is accepted');
    assert.strictEqual(res.text, '', '204 carries no body');
    assert.deepStrictEqual(seen.at(-1), VALID, 'the handler gets the validated status');
  }

  assert.strictEqual((await post({ client: 'cli', playing: false, paused: false })).status, 204);
  assert.strictEqual((await post({ client: 'cli', playing: false, paused: true })).status, 204);
  assert.strictEqual(seen.length, 3, 'all three reached the handler');

  assert.strictEqual((await post(VALID, { path: '/' })).status, 204, 'POST / is still accepted');
  assert.strictEqual((await post(VALID, { path: '/presence/' })).status, 204, 'a trailing slash is the same route');
  assert.strictEqual((await post(VALID, { path: '/presence?from=test' })).status, 204, 'a query string is ignored');

  for (const path of ['/status', '/presence/extra', '/..%2f..%2fetc/passwd', '/PRESENCE']) {
    const res = await post(VALID, { path });
    assert.strictEqual(res.status, 404, `${path} is not a route`);
  }

  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const res = await request({ port, method });
    assert.strictEqual(res.status, 405, `${method} /presence is refused`);
    if (method !== 'HEAD') assert.strictEqual(res.headers.allow, 'POST', 'the refusal says what is allowed');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined, 'no CORS grant, so a page cannot preflight its way in');
  }

  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', ''])
    assert.strictEqual((await post(VALID, { headers: { 'content-type': type } })).status, 415, `${type || 'no content-type'} is refused`);
  assert.strictEqual((await post(VALID, { headers: { 'content-type': 'application/json; charset=utf-8' } })).status, 204, 'a charset parameter is fine');

  const before = seen.length;
  for (const body of ['', '{', 'not json', '{"playing":true,}', '[1,2', 'null}']) {
    const res = await post(body);
    assert.strictEqual(res.status, 400, `${JSON.stringify(body)} is not JSON`);
  }

  assert.match((await post({ playing: 'yes' })).text, /playing must be a boolean/);
  assert.match((await post({ listeners: '6' })).text, /listeners must be a finite number/);
  assert.match((await post({ track: { a: 1 } })).text, /track must be a string/);
  assert.match((await post('"just a string"')).text, /body must be a JSON object/);
  assert.match((await post('[]')).text, /body must be a JSON object/);
  assert.strictEqual(seen.length, before, 'not one bad request reached the handler');

  const huge = JSON.stringify({ playing: true, track: 'x'.repeat(MAX_BODY * 2) });
  assert.strictEqual((await post(huge)).status, 413, 'content-length over the cap is refused');
  assert.strictEqual((await request({ port, body: huge, chunked: true, headers: { 'transfer-encoding': 'chunked' } })).status, 413, 'a chunked body over the cap is cut off');
  assert.strictEqual(seen.length, before, 'an oversized body never parsed');

  {
    const long = { playing: true, track: 'y'.repeat(4000) };
    assert.ok(JSON.stringify(long).length < MAX_BODY);
    assert.strictEqual((await post(long)).status, 204);
    assert.strictEqual(seen.at(-1).track.length, 256, 'the title was capped on the way through');
  }

  {
    const boom = await listen({ onStatus: () => { throw new Error('apply exploded'); } });
    assert.strictEqual((await request({ port: boom.port, body: JSON.stringify(VALID) })).status, 204);
    assert.strictEqual((await request({ port: boom.port, body: JSON.stringify(VALID) })).status, 204, 'and it is still answering afterwards');
    boom.server.close();
  }

  server.close();

  {
    const guarded = await listen({ token: 's3cret' });
    const send = (headers) => request({ port: guarded.port, body: JSON.stringify(VALID), headers });
    assert.strictEqual((await send({})).status, 401, 'no token, no presence');
    assert.strictEqual((await send({ [TOKEN_HEADER]: 'wrong' })).status, 401, 'a wrong token is refused');
    assert.strictEqual((await send({ [TOKEN_HEADER]: 's3cre' })).status, 401, 'a prefix of the token is not the token');
    assert.strictEqual((await send({ [TOKEN_HEADER]: 's3cretx' })).status, 401, 'nor is a longer string that starts with it');
    assert.strictEqual((await send({ [TOKEN_HEADER]: 's3cret' })).status, 204, 'the right token gets in');
    assert.strictEqual(guarded.seen.length, 1, 'only the authorised POST reached the handler');
    assert.strictEqual((await request({ port: guarded.port, body: huge })).status, 401);
    guarded.server.close();
  }

  restore();
  console.log('server: all cases pass');
}

main().catch((e) => { console.error(e); process.exit(1); });
