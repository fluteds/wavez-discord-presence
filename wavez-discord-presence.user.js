// ==UserScript==
// @name         Wavez Discord Presence
// @namespace    https://wavez.fm/
// @icon         https://wavez.fm/favicon.ico
// @version      1.4.0
// @description  Sends your wavez.fm room, track, artist, DJ and listener count to a local bridge that shows it as Discord Rich Presence.
// @homepageURL  https://github.com/fluteds/wavez-discord-presence
// @downloadURL  https://raw.githubusercontent.com/fluteds/wavez-discord-presence/main/wavez-discord-presence.user.js
// @updateURL    https://raw.githubusercontent.com/fluteds/wavez-discord-presence/main/wavez-discord-presence.user.js
// @match        https://wavez.fm/*
// @match        https://wavez.fm/~/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BRIDGE = 'http://127.0.0.1:6969';

  // The userscript sandbox means page globals live on unsafeWindow.
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // State shape: github.com/WavezFM/WavezFM-Extension-API
  function snapshot() {
    const api = W.WavezFM;
    if (!api || api.version !== '1') return null;
    const s = api.room.getState();
    if (!s) return null;

    const pb = s.playback;
    const room = s.room || {};
    const slug = room.slug;
    const playing = !!(pb && pb.title && !pb.paused);

    return {
      playing,
      track: pb ? pb.title : null,
      artist: pb ? pb.artist : null,
      dj: pb ? pb.djUsername : null,
      source: pb ? pb.source : null,
      sourceId: pb ? pb.sourceId : null,
      room: room.name || slug,
      listeners: room.activeUsersCount || null,
      image: pb ? pb.thumbnailUrl : null,
      url: slug ? `https://wavez.fm/~/${slug}` : location.href.split('#')[0],
      startedAt: pb ? pb.startedAtServerMs : null,
      durationMs: pb ? pb.durationMs : null,
      isLive: pb ? !!pb.isLive : false,
      paused: pb ? !!pb.paused : false,
    };
  }

  let last = '';
  function push() {
    const snap = snapshot();
    if (!snap) { console.log('[wz-presence] no room state yet (not in a room, or bridge not loaded)'); return; }
    const key = JSON.stringify(snap);
    if (key === last) return;
    last = key;
    console.log('[wz-presence] sending', snap);
    GM_xmlhttpRequest({
      method: 'POST',
      url: BRIDGE,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ ...snap, startedAt: snap.startedAt ? snap.startedAt / 1000 : null }),
      onload: (r) => console.log('[wz-presence] bridge replied', r.status),
      onerror: (e) => console.warn('[wz-presence] bridge unreachable', e),
    });
  }

  const api = W.WavezFM;
  if (api && api.version === '1') {
    api.room.subscribe('playback_changed', push);
    api.room.subscribe('room_changed', push);
  }
  // Heartbeat: clearing `last` forces a resend, so a bridge started after the page still syncs.
  setInterval(() => { last = ''; push(); }, 15000);
  push();

  if (location.hash === '#wz-presence-debug') {
    console.log('[wz-presence] state:', W.WavezFM?.room?.getState());
    console.log('[wz-presence] snapshot:', snapshot());
  }
})();
