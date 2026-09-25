// @ts-check

const http = require('http');
const { timingSafeEqual } = require('crypto');
const { normalizeStatus, BadPayload } = require('./status.js');
const { warn } = require('./log.js');

const MAX_BODY = 16 * 1024;
const PATHS = new Set(['/presence', '/']);
const TOKEN_HEADER = 'x-wavez-token';

/** @param {string} value @param {string} expected */
function tokenMatches(value, expected) {
  const got = Buffer.from(value);
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** @param {import('http').ServerResponse} res @param {number} code @param {string} [body] @param {Record<string, string>} [headers] */
const send = (res, code, body = '', headers = {}) => res.writeHead(code, { ...(body ? { 'content-type': 'text/plain' } : {}), ...headers }).end(body);

/**
 * @param {object} options
 * @param {(status: import('./presence.js').Status) => void} options.onStatus  called with a validated, normalized status
 * @param {string} [options.token]  when set, requests must carry it in x-wavez-token
 * @param {number} [options.maxBody]
 */
function createBridgeServer({ onStatus, token = '', maxBody = MAX_BODY }) {
  const server = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0].replace(/(.)\/+$/, '$1');
    if (!PATHS.has(path)) { send(res, 404, 'not found'); return; }
    if (req.method !== 'POST') { send(res, 405, 'method not allowed', { allow: 'POST' }); return; }
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { send(res, 415, 'expected application/json'); return; }
    if (token && !tokenMatches(String(req.headers[TOKEN_HEADER] ?? ''), token)) { warn('rejected a POST with a missing or wrong token'); send(res, 401, 'bad token'); return; }
    if (Number(req.headers['content-length']) > maxBody) { warn(`rejected a POST declaring ${req.headers['content-length']} bytes (limit ${maxBody})`); send(res, 413, 'payload too large'); return; }

    /** @type {Buffer[]} */
    const parts = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBody) {
        done = true;
        warn(`rejected a POST body over ${maxBody} bytes`);
        send(res, 413, 'payload too large');
        req.resume();
        return;
      }
      parts.push(chunk);
    });
    req.on('error', (e) => { done = true; warn('request failed:', e.message); });
    req.on('end', () => {
      if (done) return;
      done = true;
      let status;
      try { status = normalizeStatus(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch (e) {
        const why = e instanceof BadPayload || e instanceof SyntaxError ? e.message : 'bad request';
        warn('rejected a POST:', why);
        send(res, 400, why);
        return;
      }
      try { onStatus(status); } catch (e) { warn('apply failed:', e instanceof Error ? e.message : e); }
      send(res, 204);
    });
  });
  server.requestTimeout = 15000;
  return server;
}

module.exports = { createBridgeServer, MAX_BODY, TOKEN_HEADER };
