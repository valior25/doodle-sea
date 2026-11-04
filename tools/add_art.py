#!/usr/bin/env python3
"""Extract one creature from a coloring-page image: art crop (png) + silhouette path (json).
usage: add_art.py image.png id seed_x seed_y   (seed = any point inside the creature)"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
src, cid, sx, sy = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
GAPARG = int(sys.argv[5]) if len(sys.argv) > 5 else 0
ERASE = [tuple(map(int, b.split(','))) for b in sys.argv[6:]]   # x0,y0,x1,y1 boxes to blank out (bubbles etc.)
im = Image.open(src).convert('RGBA'); bg = Image.new('RGBA', im.size, (255,255,255,255)); bg.alpha_composite(im)
g = np.array(bg.convert('L')); H, W = g.shape
scale = 1672 / max(H, W)                                    # normalise line thickness assumptions
for (a,b,c_,d_) in ERASE: g[b:d_, a:c_] = 255
dark = g < 150
GAP = (GAPARG or max(3, int(round(5*max(H,W)/1024)))) | 1       # close tiny gaps in the outline before flood-filling
dark = cv2.dilate(dark.astype(np.uint8), np.ones((GAP,GAP), np.uint8)) > 0
lab, _ = ndi.label(~dark)
border = np.unique(np.r_[lab[0], lab[-1], lab[:,0], lab[:,-1]])
outside = np.isin(lab, border)
region = ~outside
lab2, n2 = ndi.label(region)
objs = ndi.find_objects(lab2)
best, bestA = 0, 0
for i, sl in enumerate(objs, start=1):
    if sl is None: continue
    ys_, xs_ = sl
    if ys_.start <= sy < ys_.stop and xs_.start <= sx < xs_.stop:      # bbox contains the seed point
        a_ = int((lab2[sl] == i).sum())
        if a_ > bestA: best, bestA = i, a_
k = best
fish = lab2 == k
ys, xs = np.nonzero(fish); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('component px', int(fish.sum()), 'bbox', x0, y0, x1, y1, 'of', W, H)
keep = cv2.dilate(fish.astype(np.uint8), np.ones((9,9), np.uint8)) > 0
art = np.where(keep, g, 255).astype(np.uint8)
pad = 12; X0, Y0, X1, Y1 = max(0,x0-pad), max(0,y0-pad), min(W,x1+pad), min(H,y1+pad)
crop = art[Y0:Y1, X0:X1]
# upscale small sources so printed lines stay crisp
up = 1.0 if (X1-X0) >= 1200 else 1200/(X1-X0)
if up > 1: crop = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
Image.fromarray(crop).save(f'public/art/{cid}.png', optimize=True)
filled = ndi.binary_fill_holes(fish)
half = max(3, int(round(2.2*up*(W/1672)*1.0)))              # erode ~half a line so the path sits on the line centre
er = cv2.erode(filled.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*half+1, 2*half+1)))
cnts, _ = cv2.findContours(er, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cnts, key=cv2.contourArea); c = cv2.approxPolyDP(c, 1.0, True)[:,0,:]
c = ((c - np.array([X0, Y0])) * up).astype(int)
d = 'M' + ' L'.join(f'{x},{y}' for x, y in c) + 'Z'
json.dump({'d': d, 'w': int(crop.shape[1]), 'h': int(crop.shape[0])}, open(f'/tmp/{cid}_path.json', 'w'))
prev = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR); cv2.polylines(prev, [c.reshape(-1,1,2)], True, (0,0,255), 3)
cv2.imwrite(f'/tmp/{cid}_contour.png', prev); print('crop', crop.shape, 'pts', len(c))
