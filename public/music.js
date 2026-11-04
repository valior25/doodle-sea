/* music.js — the background song ("Under the Sea"), looping, with its own volume + progress bar.  ReefMusic.{toggle,setVolume,seek,status,onchange} */
(function (root) {
  'use strict';
  var KEY = 'reef.music1', st = { on: true, vol: 0.45 }, listeners = [], el = null, wantPlay = false, muted = false, missing = false;
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { if (typeof s.on === 'boolean') st.on = s.on; if (+s.vol >= 0 && +s.vol <= 1) st.vol = +s.vol; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function audio() {
    if (el) return el;
    el = new Audio('/audio/under-the-sea.mp3'); el.loop = true; el.preload = 'auto'; el.volume = st.vol; el.muted = muted;
    el.addEventListener('error', function () { missing = true; emit(); });          // no song file in this install: the music card hides itself
    ['timeupdate', 'loadedmetadata', 'play', 'pause', 'durationchange'].forEach(function (ev) { el.addEventListener(ev, emit); });
    return el;
  }
  function status() { var a = el; return { on: st.on, vol: st.vol, playing: !!(a && !a.paused), t: a ? a.currentTime : 0, d: a && isFinite(a.duration) ? a.duration : 0, muted: muted, missing: missing }; }
  function emit() { var s = status(); listeners.forEach(function (f) { try { f(s); } catch (e) {} }); }
  function tryPlay() { if (!st.on) return; var p = audio().play(); if (p && p.catch) p.catch(function () { wantPlay = true; }); }
  function arm() {                                              // browsers only allow sound after a first tap / key: start then
    function go() { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); wantPlay = false; if (st.on) tryPlay(); }
    addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
  }
  root.ReefMusic = {
    toggle: function () { st.on = !st.on; save(); if (st.on) tryPlay(); else if (el) el.pause(); emit(); },
    setVolume: function (v) { st.vol = Math.min(1, Math.max(0, v)); save(); if (el) el.volume = st.vol; emit(); },
    seek: function (t) { var a = audio(); if (isFinite(t)) a.currentTime = Math.max(0, t); emit(); },
    setMuted: function (m) { muted = !!m; if (el) el.muted = muted; emit(); },
    status: status, onchange: function (f) { listeners.push(f); f(status()); }
  };
  audio(); arm(); if (st.on) tryPlay();
  if (root.ReefSound) root.ReefSound.onchange(function (s) { root.ReefMusic.setMuted(s.muted); });
})(window);
