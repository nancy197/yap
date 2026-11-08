import type * as React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, display, body, ease, Identicon, TierBadge, Caps, grad } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

type R = { x: number; y: number; w: number; h: number };
function squarify<T extends { value: number }>(items: T[], box: R): (T & R)[] {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const q = items.map((i) => ({ ...i, area: (i.value / total) * box.w * box.h }));
  const out: (T & R)[] = [];
  let r = { ...box };
  const worst = (row: number[], w: number) => { const s = row.reduce((a, b) => a + b, 0); return Math.max((w * w * Math.max(...row)) / (s * s), (s * s) / (w * w * Math.min(...row))); };
  while (q.length) {
    const short = Math.min(r.w, r.h);
    const row = [q.shift()!];
    while (q.length && worst([...row, q[0]!].map((x) => x.area), short) <= worst(row.map((x) => x.area), short)) row.push(q.shift()!);
    const thick = row.reduce((a, b) => a + b.area, 0) / short;
    let off = 0;
    for (const it of row) {
      const len = it.area / thick;
      out.push(r.w >= r.h ? { ...it, x: r.x, y: r.y + off, w: thick, h: len } : { ...it, x: r.x + off, y: r.y, w: len, h: thick });
      off += len;
    }
    r = r.w >= r.h ? { x: r.x + thick, y: r.y, w: r.w - thick, h: r.h } : { x: r.x, y: r.y + thick, w: r.w, h: r.h - thick };
  }
  return out;
}

const W = 1920; // one "station" per screen on the camera rail

export function Kaito() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stops = [cue('kaito', 'mindshare'), cue('kaito', 'leaderboards'), cue('kaito', 'profiles'), cue('kaito', 'arenas'), cue('kaito', 'staking')];
  // Camera glides to each station with a spring when the narration names it.
  let x = 0;
  stops.forEach((t, i) => { if (i > 0) x += spring({ frame: f - t + 6, fps, config: { damping: 20, stiffness: 170 } }) * W; });
  const tiles = squarify(data.yappers.map((y) => ({ ...y, value: y.share })), { x: 0, y: 0, w: 1100, h: 560 });
  const maxShare = data.yappers[0]?.share ?? 1;
  const station = (i: number, children: React.ReactNode, title: string) => (
    <div style={{ position: 'absolute', left: i * W, top: 0, width: W, height: '100%', padding: '104px 230px 0' }}>
      <div style={{ fontFamily: display, fontSize: 46, fontWeight: 700, color: C.text, letterSpacing: '-0.03em', opacity: ease(f, stops[i]! - 6, stops[i]! + 10) }}>{title}</div>
      <div style={{ marginTop: 22 }}>{children}</div>
    </div>
  );
  const flip = ease(f, stops[2]! + 4, stops[2]! + 34);
  const pool = 3000 - Math.max(0, Math.floor((f - stops[3]! - 10) / 14)) * 500;
  const stake = ease(f, stops[4]! + 8, stops[4]! + 50);
  const weight = 1 + Math.log10(1 + stake * 1000);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-x}px)` }}>
        {station(0, (
          <Sequence from={stops[0]! - 20} layout="none">
            <BrowserClip src="mindshare" from={30} width={1460} tilt={false} cams={[{ at: 0, zoom: 1.05, x: 0.55, y: 0.45 }, { at: 90, zoom: 1.25, x: 0.6, y: 0.55 }]} />
          </Sequence>
        ), 'Mindshare: who and what holds attention')}
        {station(1, (
          <Sequence from={stops[1]! - 20} layout="none">
            <BrowserClip src="leaderboard" from={60} width={1460} tilt={false} cams={[{ at: 0, zoom: 1.2, x: 0.55, y: 0.35 }, { at: 90, zoom: 1.3, x: 0.55, y: 0.5 }]} />
          </Sequence>
        ), 'Leaderboards, rank changes, smart followers')}
        {station(2, (
          <Sequence from={stops[2]! - 20} layout="none">
            <BrowserClip src="leaderboard" from={330} width={1460} tilt={false} cams={[{ at: 0, zoom: 1.15, x: 0.5, y: 0.3 }, { at: 90, zoom: 1.3, x: 0.5, y: 0.45 }]} />
          </Sequence>
        ), 'Profiles and a shareable Yap card')}
        {station(3, (
          <Sequence from={stops[3]! - 20} layout="none">
            <BrowserClip src="arena" from={45} width={1460} tilt={false} cams={[{ at: 0, zoom: 1.1, x: 0.5, y: 0.35 }, { at: 120, zoom: 1.25, x: 0.5, y: 0.45 }]} />
          </Sequence>
        ), 'Arenas: DAOs pay a topic’s best voices')}
        {station(4, (
          <div style={{ width: 1200 }}>
            <div style={{ fontFamily: mono, fontSize: 30, color: C.muted }}>stake</div>
            <div style={{ fontFamily: mono, fontSize: 90, fontWeight: 600, color: C.text }}>{Math.round(stake * 1000).toLocaleString('en-US')} sYAP</div>
            <div style={{ position: 'relative', height: 16, borderRadius: 8, background: 'rgba(255,255,255,.08)', marginTop: 24 }}>
              <div style={{ width: `${stake * 100}%`, height: '100%', borderRadius: 8, background: grad }} />
              <div style={{ position: 'absolute', left: `calc(${stake * 100}% - 18px)`, top: -10, width: 36, height: 36, borderRadius: 18, background: C.text }} />
            </div>
            <div style={{ display: 'flex', gap: 40, marginTop: 60, alignItems: 'baseline' }}>
              <span style={{ fontFamily: body, fontSize: 40, color: C.text }}>your like weighs</span>
              <span style={{ fontFamily: mono, fontSize: 110, fontWeight: 700, background: grad, WebkitBackgroundClip: 'text', color: 'transparent' }}>×{weight.toFixed(1)}</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 26, color: C.muted, marginTop: 10 }}>× (1 + log₁₀(1 + stake)) · plus 10% of every epoch to stakers</div>
          </div>
        ), 'Stake to give your likes weight')}
      </div>
    </AbsoluteFill>
  );
}
