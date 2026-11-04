#!/usr/bin/env python3
"""Turn the line-art PNGs into smooth vector SVGs (crisp at any print size).
usage: vectorize.py id [id ...]"""
import sys, cv2, numpy as np, potrace
for cid in sys.argv[1:]:
    g = cv2.imread(f'public/art/{cid}.png', 0); h, w = g.shape
    S = 2                                                      # trace at 2x so curves are smooth, then scale back
    big = cv2.resize(g, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), 1.6)
    ink = big < 140
    bm = potrace.Bitmap(~ink)
    plist = bm.trace(turdsize=30, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.1, opticurve=True, opttolerance=0.5)
    parts = []
    f = lambda p: f'{p.x / S:.1f},{p.y / S:.1f}'
    for curve in plist:
        parts.append('M' + f(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner: parts.append('L' + f(seg.c) + 'L' + f(seg.end_point))
            else: parts.append('C' + f(seg.c1) + ' ' + f(seg.c2) + ' ' + f(seg.end_point))
        parts.append('Z')
    d = ''.join(parts)
    open(f'public/art/{cid}.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><path d="{d}" fill="#000" fill-rule="evenodd"/></svg>')
    print(cid, 'curves', len(plist), 'svg KB', round(len(d) / 1024))
