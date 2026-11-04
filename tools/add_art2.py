#!/usr/bin/env python3
"""Extract one creature out of a busy scene, by bounding box.
usage: add_art2.py image id x0,y0,x1,y1 [erase boxes x0,y0,x1,y1 ...]
Keeps every ink component that lies entirely inside the box; scene objects that cross the box edge are dropped."""
import os, sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
src, cid = sys.argv[1], sys.argv[2]
bx0, by0, bx1, by1 = map(int, sys.argv[3].split(','))
ERASE = [tuple(map(int, b.split(','))) for b in sys.argv[4:] if not b.startswith('b:')]
BRIDGE = [tuple(map(int, b[2:].split(','))) for b in sys.argv[4:] if b.startswith('b:')]   # b:x0,y0,x1,y1 -> draw a missing piece of outline
im = Image.open(src).convert('RGBA'); bg = Image.new('RGBA', im.size, (255,255,255,255)); bg.alpha_composite(im)
g = np.array(bg.convert('L')); H, W = g.shape
for (a, b, c_, d_) in ERASE: g[b:d_, a:c_] = 255
for br in BRIDGE:
    if len(br) == 5:                                              # straight stroke with an explicit thickness
        cv2.line(g, (br[0], br[1]), (br[2], br[3]), 0, br[4], cv2.LINE_AA)
    else:
        a, b, c_, d_ = br; mid = ((a+c_)//2 + 5, (b+d_)//2 - 7)
        cv2.polylines(g, [np.array([[a,b],mid,[c_,d_]], np.int32).reshape(-1,1,2)], False, 0, 4, cv2.LINE_AA)
ink = (g < 150).astype(np.uint8)
ink = cv2.dilate(ink, np.ones((5,5), np.uint8))                  # join hairline gaps
lab, n = ndi.label(ink)
comps = []
for i, sl in enumerate(ndi.find_objects(lab), start=1):
    if sl is None: continue
    y, x = sl
    area = int((lab[sl] == i).sum())
    if x.start >= bx0 and y.start >= by0 and x.stop <= bx1 and y.stop <= by1 and area > 60:
        comps.append((i, area, sl))
assert comps, 'nothing inside the box'
main = max(comps, key=lambda c: c[1])
mainfill = ndi.binary_fill_holes(cv2.morphologyEx((lab == main[0]).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9,9), np.uint8)))
keep = np.zeros_like(ink, bool)
for i, area, sl in comps:
    m = lab == i
    cy, cx = ndi.center_of_mass(m)
    if (os.environ.get('KEEPALL') and (mainfill[int(cy), int(cx)] or area >= 0.02 * main[1])) or i == main[0] or mainfill[int(cy), int(cx)] or area >= 0.15 * main[1]:
        keep |= m
print('components kept:', len(np.unique(lab[keep])))
sil = cv2.morphologyEx(keep.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9,9)))
sil = ndi.binary_fill_holes(sil)
ys, xs = np.nonzero(sil); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('silhouette bbox', x0, y0, x1, y1)
art = np.where(cv2.dilate(sil.astype(np.uint8), np.ones((5,5), np.uint8)) > 0, g, 255).astype(np.uint8)
art = np.where(cv2.dilate(keep.astype(np.uint8), np.ones((5,5), np.uint8)) > 0, g, 255).astype(np.uint8)
pad = 10; X0, Y0, X1, Y1 = max(0,x0-pad), max(0,y0-pad), min(W,x1+pad), min(H,y1+pad)
crop = art[Y0:Y1, X0:X1]
up = 1.0 if (X1-X0) >= 1200 else min(1600/(X1-X0), 1200/(X1-X0)*1.0) if False else (1.0 if (X1-X0) >= 1200 else 1200/(X1-X0))
if up > 1:
    ink_ = 255.0 - cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC).astype(np.float32)
    if up > 1.8:                                   # low-res source: smooth the edges but keep thin lines DARK
        ink_ = cv2.GaussianBlur(ink_, (0,0), up * 0.30)
        ink_ = np.clip(ink_ * 2.4, 0, 255)         # boost faint/thin strokes
        t_ = np.clip((ink_ - 45) / (175 - 45), 0, 1); ink_ = 255 * t_ * t_ * (3 - 2 * t_)
    crop = (255 - np.clip(ink_, 0, 255)).astype(np.uint8)
Image.fromarray(crop).save(f'public/art/{cid}.png', optimize=True)
silu = cv2.resize(sil.astype(np.uint8)[Y0:Y1, X0:X1] * 255, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_LINEAR)
silu = (cv2.GaussianBlur(silu, (0,0), max(1, up*0.8)) > 127).astype(np.uint8)
# measure the printed outline: where the ink starts and ends, going inward from the silhouette edge
inkm = (crop < 128)
dt = cv2.distanceTransform(silu, cv2.DIST_L2, 5)
cov = []
for dd in range(0, 140):
    ring = (dt >= dd) & (dt < dd + 1)
    cov.append(float(inkm[ring].mean()) if ring.any() else 0.0)
d0 = next((i for i, v in enumerate(cov) if v > 0.5), 0)
d1 = next((i for i in range(d0 + 1, len(cov)) if cov[i] < 0.5), d0 + 20)
lineW = max(4, d1 - d0)
half = int(d0)                                                    # cut path = the OUTER edge of the printed line (thin parts survive)
print('outline px: starts', d0, 'ends', d1, 'thickness', lineW)
er = cv2.erode(silu, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*half+1, 2*half+1)))
cnts, _ = cv2.findContours(er, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cnts, key=cv2.contourArea); c = cv2.approxPolyDP(c, 1.6, True)[:,0,:]
d = 'M' + ' L'.join(f'{x},{y}' for x, y in c) + 'Z'
json.dump({'d': d, 'w': int(crop.shape[1]), 'h': int(crop.shape[0]), 'lineW': int(lineW)}, open(f'/tmp/{cid}_path.json', 'w'))
prev = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR); cv2.polylines(prev, [c.reshape(-1,1,2)], True, (0,0,255), 3)
cv2.imwrite(f'/tmp/{cid}_contour.png', prev); print('crop', crop.shape, 'pts', len(c))
