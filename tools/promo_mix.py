#!/usr/bin/env python3
"""Mixes the two clips recorded by promo.js (TV + phone picture-in-picture, middle part sped up) -> docs/promo.mp4"""
import json, subprocess, sys
tl = json.load(open('/tmp/promo/timeline.json')); off = max(0, tl['phoneStart'] - 0.7); end = tl['phoneEnd'] + 0.8; cut = tl['allIn'] + 0.3; t1 = tl['phoneEnd'] + 4.2; tot = t1 + (cut - t1) / 2 + (tl['end'] - cut)
fc = ("[1:v]scale=-2:560,pad=iw+16:ih+16:8:8:color=white@0.95,format=yuva420p[ph];"
      "[0:v][ph]overlay=x=70:y=(H-h)/2-20:enable='between(t,%.2f,%.2f)'[o];[o]split=3[a][b][c];"
      "[a]trim=0:%.2f,setpts=PTS-STARTPTS[a1];[b]trim=%.2f:%.2f,setpts=(PTS-STARTPTS)/2[b1];[c]trim=%.2f,setpts=PTS-STARTPTS[c1];"
      "[a1][b1][c1]concat=n=3:v=1:a=0,fade=t=in:st=0:d=0.6,fade=t=out:st=%.2f:d=1.2,format=yuv420p[v]") % (off, end, t1, t1, cut, cut, tot - 1.2)
out = sys.argv[1] if len(sys.argv) > 1 else 'docs/promo.mp4'
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', tl['tv'], '-itsoffset', '%.2f' % off, '-i', tl['phone'], '-filter_complex', fc, '-map', '[v]', '-r', '30',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart', out], check=True)
