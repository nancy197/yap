import type * as React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion';
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
    <div style={{ position: 'absolute', left: i * W, top: 0, width: W, height: '100%', padding: '150px 110px' }}>
      <div style={{ fontFamily: display, fontSize: 58, fontWeight: 700, color: C.text, letterSpacing: '-0.03em', opacity: ease(f, stops[i]! - 6, stops[i]! + 10) }}>{title}</div>
      <div style={{ marginTop: 40 }}>{children}</div>
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
          <div style={{ display: 'flex', gap: 40 }}>
            <div style={{ position: 'relative', width: 1100, height: 560 }}>
              {tiles.map((t, i) => {
                const s = ease(f, stops[0]! + i * 3, stops[0]! + i * 3 + 14);
                return (
                  <div key={t.account} style={{ position: 'absolute', left: t.x + 3, top: t.y + 3, width: t.w - 6, height: t.h - 6, borderRadius: 12, padding: 12, background: `color-mix(in srgb, ${C.orange} ${Math.round(30 + 60 * (t.share / maxShare))}%, ${C.violet})`, opacity: s, transform: `scale(${0.7 + 0.3 * s})`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
                    {Math.min(t.w, t.h) > 110 && <Identicon seed={t.account} size={Math.min(70, Math.min(t.w, t.h) / 2.5)} />}
                    {Math.min(t.w, t.h) > 60 && <div style={{ fontFamily: body, fontWeight: 600, fontSize: Math.min(26, t.w / 8), color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.4)' }}>{t.name}<div style={{ fontFamily: mono }}>{(t.share * 100).toFixed(1)}%</div></div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start', width: 420 }}>
              {data.topics.map((t, i) => (
                <span key={t.topic} style={{ fontFamily: mono, fontSize: 24, color: C.violet, border: `1.5px solid ${C.violet}`, borderRadius: 999, padding: '6px 14px', opacity: ease(f, stops[0]! + 20 + i * 3, stops[0]! + 30 + i * 3) }}>{t.topic} {(t.share * 100).toFixed(0)}%</span>
              ))}
            </div>
          </div>
        ), 'Mindshare: who and what holds attention')}
        {station(1, (
          <div style={{ width: 1300, borderRadius: 24, border: `1px solid ${C.border}`, background: 'rgba(26,25,32,0.85)', overflow: 'hidden' }}>
            {data.yappers.slice(0, 8).map((y, i) => {
              const s = ease(f, stops[1]! + i * 4, stops[1]! + i * 4 + 14);
              const d = [2, 0, 1, -1, 3, 0, -2, 1][i]!;
              return (
                <div key={y.account} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '16px 26px', borderBottom: `1px solid ${C.border}`, opacity: s, transform: `translateX(${(1 - s) * 80}px)`, fontFamily: body, fontSize: 26, color: C.text }}>
                  <span style={{ fontFamily: mono, width: 40, color: i < 3 ? C.orange : C.muted }}>{i + 1}</span>
                  <Identicon seed={y.account} size={44} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{y.name}</span>
                  <span style={{ fontFamily: mono, width: 120, textAlign: 'right' }}>{y.score.toFixed(2)}</span>
                  <span style={{ fontFamily: mono, width: 120, textAlign: 'right' }}>{(y.share * 100).toFixed(1)}%</span>
                  <span style={{ fontFamily: mono, width: 80, textAlign: 'right', color: d > 0 ? C.blue : d < 0 ? C.orange : C.faint }}>{d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '–'}</span>
                  <span style={{ fontFamily: mono, width: 140, textAlign: 'right', color: C.muted }}>{y.smart} smart</span>
                  <span style={{ width: 150, textAlign: 'right' }}><TierBadge t={y.tier} /></span>
                </div>
              );
            })}
          </div>
        ), 'Leaderboards, rank changes, smart followers')}
        {station(2, (
          <div style={{ perspective: 1600 }}>
            <div style={{ width: 1000, height: 520, borderRadius: 36, padding: 50, background: `radial-gradient(circle at 100% 0%, rgba(167,139,250,0.45), transparent 55%), radial-gradient(circle at 0% 100%, rgba(255,138,61,0.4), transparent 55%), #1d1a24`, border: `1px solid ${C.border}`, transform: `rotateY(${(1 - flip) * -70}deg) rotateX(${(1 - flip) * 12}deg)`, opacity: flip, boxShadow: '0 40px 100px rgba(0,0,0,.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
                <Identicon seed={data.yappers[0]!.account} size={110} />
                <div>
                  <div style={{ fontFamily: display, fontSize: 64, fontWeight: 700, color: C.text }}>{data.yappers[0]!.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 26, color: C.muted }}>{data.yappers[0]!.account}</div>
                </div>
                <span style={{ marginLeft: 'auto' }}><TierBadge t={data.yappers[0]!.tier} /></span>
              </div>
              <div style={{ display: 'flex', gap: 70, marginTop: 70 }}>
                {[['Yap score', data.yappers[0]!.score.toFixed(1)], ['Mindshare', `${(data.yappers[0]!.share * 100).toFixed(1)}%`], ['Rank', '#1'], ['Smart flw', String(data.yappers[0]!.smart)]].map(([k, v]) => (
                  <div key={k}><Caps>{k}</Caps><div style={{ fontFamily: mono, fontSize: 64, fontWeight: 600, color: C.text }}>{v}</div></div>
                ))}
              </div>
              <div style={{ marginTop: 40, fontFamily: mono, fontSize: 24, color: C.amber }}>Download Yap card · share on near.social</div>
            </div>
          </div>
        ), 'Profiles and a shareable Yap card')}
        {station(3, (
          <div style={{ display: 'flex', gap: 50, alignItems: 'flex-start' }}>
            <div style={{ width: 760, borderRadius: 28, padding: 36, background: 'rgba(26,25,32,0.88)', border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: display, fontSize: 48, fontWeight: 700, color: C.text }}>near builders arena</span>
                <span style={{ fontFamily: mono, fontSize: 28, color: C.violet }}>#near</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: 24, color: C.muted, marginTop: 10 }}>funded by {data.dao} · proposal #0 · 2 of 3 council</div>
              <div style={{ display: 'flex', gap: 50, marginTop: 30 }}>
                <div><Caps>per epoch</Caps><div style={{ fontFamily: mono, fontSize: 44, color: C.text }}>500 YAP</div></div>
                <div><Caps>budget left</Caps><div style={{ fontFamily: mono, fontSize: 44, color: C.amber }}>{Math.max(0, pool).toLocaleString('en-US')}</div></div>
                <div><Caps>min tier</Caps><div style={{ marginTop: 10 }}><TierBadge t={1} /></div></div>
              </div>
              <div style={{ height: 18, borderRadius: 9, background: 'rgba(255,255,255,.07)', marginTop: 26, overflow: 'hidden' }}><div style={{ width: `${(Math.max(0, pool) / 3000) * 100}%`, height: '100%', background: grad }} /></div>
            </div>
            <div style={{ display: 'grid', gap: 18 }}>
              {data.yappers.slice(0, 3).map((y, i) => (
                <div key={y.account} style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: body, fontSize: 28, color: C.text, opacity: ease(f, stops[3]! + 16 + i * 6, stops[3]! + 26 + i * 6) }}>
                  <Identicon seed={y.account} size={56} /> {y.name} <span style={{ fontFamily: mono, color: C.amber }}>+{[210, 160, 130][i]} YAP</span>
                </div>
              ))}
            </div>
          </div>
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
