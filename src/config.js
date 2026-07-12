// @ts-check
// Resolved from cwd, not __dirname: under `npx` the script runs from npm's cache.

const path = require('path');

/**
 * @type {{
 *   appId?: string,
 *   port?: number,
 *   largeImage?: string,
 *   sourceBadges?: boolean,
 *   lastfmKey?: string,
 * }}
 */
let config = {};
try { config = require(path.resolve(process.cwd(), 'config.json')); } catch { }

module.exports = config;
