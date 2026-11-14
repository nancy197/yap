// The mechanic, Proof of Yap edition: yap and earn each tick, everyone's yap fills one bar, the full bar explodes the
// jackpot (split by contribution over the whole block, real numbers from token4's first jackpot), the next block
// needs 25% more, and the contract has no keys.
import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, display, body, Kinetic, ease, Caps, short, grad } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

const J = (data as any).jackpot ?? { block: 1, tick: 3, ticks: 4, payout: 60744.9, contributors: 35, top: [] };
// Block #1 progress after each tick on token4 (attention units): 87.1, +10.5, +88.5, then tick 3 crosses 300.
const STEPS = [0, 87.1, 97.6, 186.2, 300];
const fmt = (n: number | readonly number[]) => Math.round(Number(n)).toLocaleString('en-US');

export function Meme() {
  const f = useCurrentFrame();
  const tEarn = cue('meme', 'earn');
  const tBar = cue('meme', 'bar');
  const tBoom = cue('meme', 'explodes');
  const tSplit = cue('meme', 'split');
  const tNext = cue('meme', 'next');
  const tNobody = cue('meme', 'nobody');
  // The bar fills tick by tick between "bar" and "explodes".
  const span = Math.max(20, tBoom - tBar);
  const keys = STEPS.map((_, i) => tBar + (span * i) / (STEPS.length - 1));
  const filled = f < tNext ? interpolate(f, keys, STEPS, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : interpolate(f, [tNext, tNext + 40], [0, 34], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const threshold = f < tNext ? 300 : 375;
  const pct = Math.min(100, (filled / threshold) * 100);
  const tickNow = Math.min(3, Math.max(0, Math.floor(interpolate(f, keys, [0, 1, 2, 3, 3.99], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))));
  const boom = ease(f, tBoom - 2, tBoom + 10);
  const boomFade = 1 - ease(f, tSplit + 30, tSplit + 50);
  const splitIn = ease(f, tSplit, tSplit + 14);
  const nextIn = ease(f, tNext, tNext + 14);
  const lockIn = ease(f, tNobody - 4, tNobody + 18);
  // The page shows pot + the vault release it will add, so the jackpot starts near 60,000 and creeps up.
  const pot = interpolate(f, [tBar, tBoom], [60000, J.payout], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const barColor = f >= tBoom && f < tNext ? C.amber : C.orange;
  const posts = ['Shipping the indexer fix tonight #near', 'TEE attestation, explained in 3 lines #nearai', 'Block is 60% full, keep yapping $YAP'];
  return (
    <AbsoluteFill style={{ padding: '120px 110px' }}>
      <div style={{ opacity: 1 - lockIn * 0.92, transform: `translateY(${-lockIn * 40}px)` }}>
        <Kinetic text="The meme: Proof of Yap." size={66} delay={4} highlight={['Proof', 'Yap.']} />
        {/* 1. yap and earn */}
        <div style={{ display: 'flex', gap: 18, marginTop: 34, height: 64, opacity: ease(f, tEarn - 6, tEarn + 8) * (1 - ease(f, tSplit, tSplit + 10)) }}>
          {posts.map((t, i) => {
            const at = tEarn + i * 8;
            const s = ease(f, at, at + 10);
            return (
              <div key={t} style={{ position: 'relative', flex: 1, borderRadius: 18, padding: '14px 18px', background: 'rgba(26,25,32,0.85)', border: `1px solid ${C.border}`, fontFamily: body, fontSize: 22, color: C.text, opacity: s, transform: `translateY(${(1 - s) * 30}px)`, whiteSpace: 'nowrap', overflow: 'visible' }}>
                {t}
                <span style={{ position: 'absolute', right: 14, top: -20 - ease(f, at + 8, at + 30) * 22, fontFamily: mono, fontSize: 24, fontWeight: 700, color: C.amber, opacity: ease(f, at + 8, at + 14) * (1 - ease(f, at + 34, at + 44)) }}>+{(12.4 + i * 3.1).toFixed(1)} YAP</span>
              </div>
            );
          })}
        </div>
        {/* 2. one shared bar */}
        <div style={{ marginTop: 46, opacity: ease(f, tBar - 8, tBar + 6) }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <Caps>{f < tNext ? `Block #${J.block}` : `Block #${J.block + 1}`} · community attention</Caps>
            <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 30, color: C.text }}>{fmt(filled)} / {threshold}{f >= tNext && <span style={{ color: C.amber, opacity: nextIn }}>  (+25%)</span>}</span>
          </div>
          <div style={{ position: 'relative', marginTop: 16, height: 74, borderRadius: 37, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, overflow: 'visible' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 37, background: `linear-gradient(90deg, ${C.violet}, ${barColor})`, boxShadow: `0 0 ${40 + boom * 80}px ${barColor}88` }} />
            {f < tNext && [1, 3].map((i) => (
              <div key={i} style={{ position: 'absolute', left: `${(STEPS[i]! / 300) * 100}%`, top: 84, transform: 'translateX(-50%)', fontFamily: mono, fontSize: 18, color: tickNow >= i ? C.muted : 'transparent' }}>tick {i - 1}</div>
            ))}
            {/* explosion */}
            {f >= tBoom && f < tNext && Array.from({ length: 26 }, (_, i) => {
              const a = (i / 26) * Math.PI * 2;
              const r = ease(f, tBoom, tBoom + 22) * (160 + (i % 5) * 40);
              return <div key={i} style={{ position: 'absolute', right: 0, top: 37, width: 14, height: 14, borderRadius: 7, background: i % 2 ? C.amber : C.orange, transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`, opacity: boomFade * (1 - ease(f, tBoom + 14, tBoom + 30)) }} />;
            })}
          </div>
        </div>
        {/* 3. jackpot + split */}
        <div style={{ display: 'flex', gap: 40, marginTop: 62, alignItems: 'stretch', opacity: ease(f, tBar, tBar + 10) * (1 - nextIn * 0.85) }}>
          <div style={{ flex: 1, borderRadius: 28, padding: 34, border: `2px solid ${f >= tBoom ? C.amber : C.border}`, background: f >= tBoom ? `${C.amber}14` : 'rgba(26,25,32,0.78)', transform: `scale(${1 + boom * 0.04 * boomFade})` }}>
            <Caps>{f >= tBoom ? '💥 Jackpot exploded' : '💰 Jackpot'}</Caps>
            <div style={{ fontFamily: display, fontSize: 92, fontWeight: 700, lineHeight: 1.05, marginTop: 8, background: grad, WebkitBackgroundClip: 'text', color: 'transparent' }}>{fmt(pot)} YAP</div>
            <div style={{ fontFamily: body, fontSize: 26, color: C.muted, marginTop: 10 }}>20% of every mint + 10% of the vault</div>
          </div>
          <div style={{ flex: 1.15, borderRadius: 28, padding: '26px 34px', background: 'rgba(26,25,32,0.78)', border: `1px solid ${C.border}`, opacity: splitIn }}>
            <Caps>Split by contribution · all {J.ticks} ticks · {J.contributors} yappers</Caps>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {(J.top as { name: string; amount: number }[]).slice(0, 5).map((y, i) => {
                const w = ease(f, tSplit + 4 + i * 4, tSplit + 18 + i * 4);
                return (
                  <div key={y.name} style={{ display: 'grid', gridTemplateColumns: '210px 1fr 150px', alignItems: 'center', gap: 14, fontFamily: mono, fontSize: 22 }}>
                    <span style={{ color: C.text }}>{y.name}</span>
                    <div style={{ height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}><div style={{ width: `${(y.amount / J.top[0].amount) * 100 * w}%`, height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${C.violet}, ${C.amber})` }} /></div>
                    <span style={{ color: C.amber, textAlign: 'right' }}>{fmt(y.amount * w)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* the real $YAP page and the "no admin key" proof */}
      <AbsoluteFill style={{ opacity: lockIn }}>
        <Sequence from={tNobody - 12} layout="none">
          <BrowserClip src="token" from={60} width={1500} style={{ position: 'absolute', left: 210, top: 150 }} cams={[{ at: 0, zoom: 1.0, x: 0.5, y: 0.4 }, { at: 40, zoom: 1.0, x: 0.5, y: 0.4 }, { at: 100, zoom: 1.7, x: 0.83, y: 0.47 }]} />
        </Sequence>
        <div style={{ position: 'absolute', left: 120, bottom: 150, display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(14,13,18,0.94)', border: `1px solid ${C.border}`, borderRadius: 22, padding: '18px 28px', opacity: ease(f, tNobody + 40, tNobody + 55) }}>
          <svg width={54} height={62} viewBox="0 0 24 28"><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke={C.amber} strokeWidth={2.2} /><rect x={3} y={12} width={18} height={14} rx={3} fill={C.orange} /><circle cx={12} cy={19} r={2} fill="#1a0f06" /></svg>
          <div><div style={{ fontFamily: display, fontSize: 44, fontWeight: 700, color: C.text }}>0 access keys</div><div style={{ fontFamily: mono, fontSize: 18, color: C.faint }}>{data.token} · tx {short(data.tx.deploy.at(-1)?.hash ?? '', 8)}</div></div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
