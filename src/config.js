// @ts-check

const path = require('path');

/**
 * @type {{
 *   appId?: string,
 *   port?: number,
 *   largeImage?: string,
 *   sourceBadges?: boolean,
 *   lastfmKey?: string,
 *   token?: string,
 * }}
 */
let config = {};
try { config = require(path.resolve(process.cwd(), 'config.json')); } catch { }

module.exports = config;
