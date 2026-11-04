/* icons.js — one consistent line-icon set (24px grid, 2px round strokes) used on the TV, drawer and phone.  Icons.svg('name', size) */
(function (root) {
  'use strict';
  var P = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'sound-on': '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 010 6M18 6.8a7.5 7.5 0 010 10.4"/>',
    'sound-low': '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 010 6"/>',
    'sound-off': '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.3-2h5.4L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z"/><circle cx="12" cy="13" r="3.6"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3.5 3.5 2.5-2.5L20 17"/>',
    fish: '<path d="M3 12c3-4.5 7-6 11-4.2 2.2 1 3.8 2.6 5 4.2-1.2 1.6-2.8 3.2-5 4.2C10 17.8 6 16.5 3 12z"/><path d="M19 12l3-3.2v6.4L19 12z"/><circle cx="8.6" cy="11" r=".9" fill="currentColor"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
    print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 019.5 5 7.5 7.5 0 1019 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5l1.3 2.2 2.5-.6.9 2.4 2.4.9-.6 2.5 2.2 1.3-2.2 1.3.6 2.5-2.4.9-.9 2.4-2.5-.6L12 20.5l-1.3-2.2-2.5.6-.9-2.4-2.4-.9.6-2.5L3.3 12l2.2-1.3-.6-2.5 2.4-.9.9-2.4 2.5.6L12 3.5z"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0112 8a3.9 3.9 0 017 2.1c0 5.1-7 9.4-7 9.4z"/>',
    pencil: '<path d="M5 19l1-4L16.5 4.5l3 3L9 18l-4 1zM14.5 6.5l3 3"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7L12 4z"/>',
    drop: '<path d="M12 4s6 6.2 6 10.2A6 6 0 016 14.2C6 10.2 12 4 12 4z"/>',
    wave: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    undo: '<path d="M9 8L5 12l4 4M5 12h9a5 5 0 010 10h-2" transform="translate(0 -3)"/>',
    crayon: '<path d="M5 19l1.2-4.2L16.5 4.5a2 2 0 013 3L9.2 17.8 5 19zM14.5 6.5l3 3"/>',
    jump: '<path d="M4 17c3-9 9-12 16-10M20 7l-4.5-.5M20 7l-1 4.5"/>'
  };
  root.Icons = { svg: function (name, size, cls) { size = size || 22; return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>'; } };
})(window);
