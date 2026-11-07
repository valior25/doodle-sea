/* reef.js — small shared helpers for the browser pages (API calls, dates, names, haptics). */
(function (root) {
  'use strict';
  var R = {};
  // every change goes through here: JSON + the X-Reef header the server requires (it refuses requests from other web pages)
  R.api = function (method, path, body) {
    var o = { method: method, headers: { 'X-Reef': '1' } };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('שגיאה ' + r.status)); e.status = r.status; throw e; } return j; });
    });
  };
  R.fishUrl = function (id) { return '/fish/' + id + '.png'; };          // the static build swaps this for in-memory URLs
  R.joinInfo = null;                                                       // static build: { url, label } for the phone QR
  R.friendly = function (e) {
    if (!e) return 'משהו השתבש. נסו שוב.';
    if (e.status === 429) return 'רגע, לאט לאט. נסו שוב עוד כמה שניות.';
    if (e.status === 403 || e.status === 415) return 'הבקשה נדחתה. פתחו את הדף מהאקווריום עצמו.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) return window.REEF_MODE === 'static' ? 'אין חיבור לטלוויזיה. סרקו שוב את הקוד שעל המסך.' : 'אין חיבור לאקווריום. בדקו שהטלפון על אותה רשת Wi-Fi.';
    return 'משהו השתבש. נסו שוב.';
  };
  R.date = function (t) { try { return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };
  R.sameDay = function (a, b) { var x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); };
  R.vibrate = function (p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  R.cid = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); };
  R.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  R.albumKinds = function () { return (root.Creatures ? root.Creatures.list.filter(function (c) { return !c.hidden; }) : []); };
  root.Reef = R;
})(window);
