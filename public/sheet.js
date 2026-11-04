/* sheet.js — draws one coloring sheet as an SVG string (millimetre units). */
(function (root) {
  'use strict';
  var C = root.Creatures, S = C.SHEET;

  function marker(x, y, bits) {
    var cell = S.marker / 6, out = '';
    function rect(cx, cy) { return '<rect x="' + (x + cx * cell).toFixed(3) + '" y="' + (y + cy * cell).toFixed(3) + '" width="' + (cell + 0.02).toFixed(3) + '" height="' + (cell + 0.02).toFixed(3) + '"/>'; }
    for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++) {
      var border = r === 0 || r === 5 || c === 0 || c === 5;
      if (border || bits[(r - 1) * 4 + (c - 1)] === 0) out += rect(c, r);
    }
    return '<g fill="#000">' + out + '</g>';
  }

  function svg(c, o) {
    o = o || {};
    var p = C.place(c), s = p.s, lw = 1.3;
    var det = '';
    (c.dashes || []).forEach(function (d) { det += '<path d="' + d + '" fill="none" stroke="#8a8f96" stroke-width="' + (0.7 / s).toFixed(3) + '" stroke-dasharray="' + (2.4 / s).toFixed(2) + ' ' + (2.4 / s).toFixed(2) + '" stroke-linecap="round"/>'; });
    (c.lines || []).forEach(function (d) { det += '<path d="' + d + '" fill="none" stroke="#3a3f46" stroke-width="' + (0.9 / s).toFixed(3) + '" stroke-linecap="round" stroke-linejoin="round"/>'; });
    (c.eyes || []).forEach(function (e) {
      det += '<circle cx="' + e[0] + '" cy="' + e[1] + '" r="' + e[2] + '" fill="#fff" stroke="#222" stroke-width="' + (1 / s).toFixed(3) + '"/>' +
             '<circle cx="' + (e[0] + e[2] * 0.2) + '" cy="' + e[1] + '" r="' + (e[2] * 0.5).toFixed(2) + '" fill="#222"/>';
    });
    var body;
    if (c.art) {
      body = '<g transform="translate(' + p.tx.toFixed(3) + ' ' + p.ty.toFixed(3) + ') scale(' + s.toFixed(5) + ')">' +
        '<image href="' + (o.artHref || c.art.src) + '" x="0" y="0" width="' + c.art.w + '" height="' + c.art.h + '"/></g>';
    } else
    body = '<g transform="translate(' + p.tx.toFixed(3) + ' ' + p.ty.toFixed(3) + ') scale(' + s.toFixed(5) + ')">' +
      '<path d="' + c.d + '" fill="#fff" stroke="#222" stroke-width="' + (lw / s).toFixed(3) + '" stroke-linejoin="round"/>' + det + '</g>';

    var marks = '';
    C.CORNERS.forEach(function (k) { marks += marker(S.pos[k][0], S.pos[k][1], C.codes[c.id + ':' + k]); });

    var text = '';
    if (!o.preview) {
      text = '<text x="148.5" y="14" text-anchor="middle" direction="rtl" font-family="Rubik,Arial,sans-serif" font-size="5" fill="#9aa3ab">ים של ציורים · צבעו אותי ובואו נצלם!</text>' +
             '<text x="148.5" y="192.5" text-anchor="middle" direction="rtl" font-family="Rubik,Arial,sans-serif" font-weight="700" font-size="13" fill="#1d4f7a">' + c.he + '</text>' +
             '<text x="148.5" y="199" text-anchor="middle" direction="rtl" font-family="Rubik,Arial,sans-serif" font-size="3.8" fill="#8a949c">אפשר לצבוע בחופשיות, גם מעבר לקווים.</text>' +
             '<text x="148.5" y="203.4" text-anchor="middle" direction="rtl" font-family="Rubik,Arial,sans-serif" font-size="3.8" fill="#8a949c">התוכנה תסתדר ותגזור את החיה.</text>' +
             '<text x="148.5" y="208" text-anchor="middle" direction="rtl" font-family="Rubik,Arial,sans-serif" font-weight="700" font-size="4.2" fill="#3d4a55">בבקשה לא לצבוע את ארבעת הריבועים השחורים.</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S.w + ' ' + S.h + '" width="' + S.w + 'mm" height="' + S.h + 'mm"><rect width="' + S.w + '" height="' + S.h + '" fill="#fff"/>' + body + marks + text + '</svg>';
  }
  root.SheetArt = { svg: svg, OUTLINE_MM: 1.3 };
})(window);
