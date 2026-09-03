#!/usr/bin/env python3
"""Plot ONE live-recorded trackpad gesture (rig/live-recorder.mjs) in the same style as the
diagnostician's BEFORE/AFTER plots (../../scrollLeft-traces.png, ../../after/rig/plot-traces.py):
top panel = per-frame day-strip scrollLeft, dot colour = HUD ownership (blue manual / red manoeuvre /
green native-dock); orange vertical lines = scrollTo(smooth) calls; ticks along the bottom = the
REAL wheel events (black; a --selftest burst's synthetic events are grey); each motion phase
annotated with its signed travel. Added for live data: a lower panel with each wheel event's deltaX
(stems) and the per-frame velocity (px/s, faint), since with a real trackpad the input stream is
the unknown we are measuring.

Usage: plot-gesture.py <run-dir> <out.png> <tag>
"""
import csv
import json
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

run_dir, out_png, tag = sys.argv[1:4]

with open(f'{run_dir}/{tag}-frames.csv') as f:
    frames = list(csv.DictReader(f))
with open(f'{run_dir}/{tag}-summary.json') as f:
    s = json.load(f)

OWN_COLOUR = {'manual': 'tab:blue', 'manoeuvre': 'tab:red', 'native': 'tab:green'}

t = [float(r['t_ms']) for r in frames]
pos = [float(r['scrollLeft']) for r in frames]
vel = [float(r['vel_px_s']) for r in frames]
colours = [OWN_COLOUR.get(r['hud_ownership'], 'grey') for r in frames]
tmax = max(t) if t else 1

fig, (ax, ax2) = plt.subplots(2, 1, figsize=(16.5, 8.2), sharex=True,
                              gridspec_kw={'height_ratios': [3, 1.4]})

# Background shaded by the app's gesture state machine (frames.csv `state`, from the `[gesture]`
# console lines): light blue = DRAGGING, light red = DECELERATING, STILL unshaded. Contiguous
# runs of one state become one span (drawn on both panels).
STATE_COLOUR = {'DRAGGING': '#cfe6ff', 'DECELERATING': '#ffd6d6'}
states = [r.get('state', '') for r in frames]
runs = []
for i, st in enumerate(states):
    if runs and runs[-1][0] == st:
        runs[-1][2] = i
    else:
        runs.append([st, i, i])
for st, i0, i1 in runs:
    if st not in STATE_COLOUR:
        continue
    x0 = t[i0]
    x1 = t[i1 + 1] if i1 + 1 < len(t) else t[i1]
    for a in (ax, ax2):
        a.axvspan(x0, x1, color=STATE_COLOUR[st], alpha=0.6, linewidth=0, zorder=0)
    ax.text((x0 + x1) / 2, 0.985, st, transform=ax.get_xaxis_transform(), ha='center', va='top',
            fontsize=7, color='tab:blue' if st == 'DRAGGING' else 'tab:red', alpha=0.8)

ax.plot(t, pos, color='grey', linewidth=0.8, zorder=1)
ax.scatter(t, pos, c=colours, s=9, zorder=2)
for c in s['scrollToCalls']:
    if c.get('behavior') == 'smooth':
        ax.axvline(c['t'], color='orange', alpha=0.35, linewidth=1, zorder=0)
y0 = min(pos) if pos else 0
span = ((max(pos) - y0) if pos else 0) or 1
for ev in s['fired']:
    ax.plot([ev['t'], ev['t']], [y0 - span * 0.06, y0 - span * 0.02],
            color='black' if ev['phase'] == 'finger' else 'grey', linewidth=0.8, zorder=1)
for p in s['phases']:
    ax.annotate(f"{p['travel']:+.0f}px", (p['endT'], p['endPos']), fontsize=8,
                xytext=(4, 4), textcoords='offset points')
if s.get('lastWheelT'):
    ax.axvline(s['lastWheelT'], color='black', alpha=0.25, linewidth=1, linestyle='--', zorder=0)
# Each `[plan]` solve (summary.plans): a dashed magenta line labelled 'PING #n' (the app's own
# counter). More than one per gesture is the PLAN-VIOLATION the HUD flags red.
plans = s.get('plans', [])
for i, pl in enumerate(plans):
    for a in (ax, ax2):
        a.axvline(pl['t'], color='magenta', alpha=0.8, linewidth=1.2, linestyle='--', zorder=3)
    ax.text(pl['t'], 0.90 - 0.06 * (i % 3), f"PING #{pl['n']}", transform=ax.get_xaxis_transform(),
            ha='left', va='top', fontsize=8, color='magenta', fontweight='bold')
plan_title = f"plans={s['planCount']}" if 'planCount' in s else ''
if s.get('planViolation'):
    plan_title += ' PLAN-VIOLATION'
ax.set_title(f"{tag}  wheel={s['wheelEvents']} over {s['wheelSpanMs']}ms  phases={len(s['phases'])} {plan_title} "
             f"reverses={s['motionReverses']} pauseThenMove={s['pauseThenMove']} "
             f"scrollTo(smooth)={len(s['scrollToSmoothCalls'])} peak={s['peakVelocityPxPerS']}px/s "
             f"glide={s['glideDistancePx']}px/{s['glideDurationMs']}ms dockError={s['dockError']}px "
             f"HUD={s['hudFinal']['ownership']}/{s['hudFinal']['intent']}", fontsize=9)
ax.set_ylabel('scrollLeft px')
ax.set_xlim(0, tmax)

# Lower panel: wheel deltaX stems + frame velocity.
wt = [ev['t'] for ev in s['fired']]
wdx = [ev['dx'] for ev in s['fired']]
if wt:
    ax2.stem(wt, wdx, linefmt='k-', markerfmt='k.', basefmt='k:')
ax2.set_ylabel('wheel deltaX (px/evt)')
ax2.set_xlabel('ms since gesture pre-roll (dashed = last wheel event)')
ax3 = ax2.twinx()
ax3.plot(t, vel, color='tab:purple', alpha=0.35, linewidth=0.8)
ax3.set_ylabel('frame velocity px/s', color='tab:purple')
ax2.axvline(s.get('lastWheelT', 0), color='black', alpha=0.25, linewidth=1, linestyle='--')

fig.suptitle(f"live trackpad gesture — {s['savedAt']} — {s['ua'].split(') ')[-1][:60]}", fontsize=8)
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(out_png, dpi=100)
print('wrote', out_png)
