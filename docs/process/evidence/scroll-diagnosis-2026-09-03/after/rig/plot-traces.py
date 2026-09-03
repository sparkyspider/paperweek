#!/usr/bin/env python3
"""Plot per-frame day-strip scrollLeft traces for a set of trackpad-rig runs, in the same format
as the diagnostician's BEFORE plot (../scrollLeft-traces.png): one panel per run; dot colour =
HUD ownership (blue manual / red manoeuvre / green native-dock); orange vertical lines =
dockToNearest scrollTo(smooth) calls; ticks along the bottom = the synthetic wheel events (dark
finger, grey inertia); each motion phase annotated with its signed travel.

Usage: plot-traces.py <run-dir> <out.png> <title> <tag> [<tag> ...]
"""
import csv
import json
import math
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

run_dir, out_png, title, *tags = sys.argv[1:]

cols = 2
rows = math.ceil(len(tags) / cols)
fig, axes = plt.subplots(rows, cols, figsize=(16.5, 4.3 * rows), squeeze=False)

OWN_COLOUR = {'manual': 'tab:blue', 'manoeuvre': 'tab:red', 'native': 'tab:green'}

for i, tag in enumerate(tags):
    ax = axes[i // cols][i % cols]
    with open(f'{run_dir}/{tag}-frames.csv') as f:
        frames = list(csv.DictReader(f))
    with open(f'{run_dir}/{tag}-summary.json') as f:
        s = json.load(f)
    t = [float(r['t_ms']) for r in frames]
    pos = [float(r['scrollLeft']) for r in frames]
    colours = [OWN_COLOUR.get(r['hud_ownership'], 'grey') for r in frames]
    ax.plot(t, pos, color='grey', linewidth=0.8, zorder=1)
    ax.scatter(t, pos, c=colours, s=9, zorder=2)
    for c in s['scrollToCalls']:
        ax.axvline(c['t'], color='orange', alpha=0.35, linewidth=1, zorder=0)
    y0 = min(pos)
    span = (max(pos) - y0) or 1
    for ev in s['fired']:
        ax.plot([ev['t'], ev['t']], [y0 - span * 0.06, y0 - span * 0.02],
                color='black' if ev['phase'] == 'finger' else 'grey', linewidth=0.8, zorder=1)
    for p in s['phases']:
        ax.annotate(f"{p['travel']:+.0f}px", (p['endT'], p['endPos']), fontsize=8,
                    xytext=(4, 4), textcoords='offset points')
    ax.set_title(f"{tag}  phases={len(s['phases'])} reverses={s['motionReverses']} "
                 f"scrollTo(smooth) calls={len(s['scrollToCalls'])} dockError={s['dockError']}px", fontsize=10)
    ax.set_xlabel('ms since instrumentation')
    ax.set_ylabel('scrollLeft px')
    ax.set_xlim(0, max(t))

for j in range(len(tags), rows * cols):
    axes[j // cols][j % cols].axis('off')

fig.suptitle(title, fontsize=9)
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(out_png, dpi=100)
print('wrote', out_png)
