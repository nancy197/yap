import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, display, mono, body, Kinetic, useSpring, ease, Identicon } from '../ui/kit';
import { cue } from '../timeline';

const POSTS = ['gm builders, shipping v2 today', 'thread: why restaking matters', 'new AI agent stack just dropped', 'my top 5 L1s this cycle', 'airdrop farming is back?'];

export function Hook() {
  const f = useCurrentFrame();
  const tBan = cue('hook', 'bans');
  const tKaito = cue('hook', 'kaito');
  const tOne = cue('hook', 'one');
  const date = useSpring(4);
  const stamp = useSpring(tBan + 8, { damping: 9, stiffness: 220 });
  const shake = f > tBan + 8 && f < tBan + 20 ? Math.sin(f * 3) * (tBan + 20 - f) * 0.8 : 0;
  const collapse = ease(f, tKaito + 6, tKaito + 30);
  const fadeAll = ease(f, tOne - 6, tOne + 10);
  const chart = ease(f, tKaito + 4, tKaito + 40);
  const pts = Array.from({ length: 30 }, (_, i) => {
    const x = (i / 29) * 520;
    const drop = i > 18 ? (i - 18) * 9 : 0;
    const y = 60 + Math.sin(i / 2.5) * 12 - i * 0.6 + drop;
    return `${x},${y}`;
  });
  const shown = Math.max(2, Math.round(chart * pts.length));
  return (
    <AbsoluteFill style={{ padding: '140px 120px' }}>
      <div style={{ opacity: 1 - fadeAll * 0.85, transform: `scale(${1 - fadeAll * 0.06})`, display: 'flex', gap: 80, height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <div style={{ fontFamily: mono, fontSize: 28, color: C.muted, letterSpacing: '0.2em', opacity: date }}>2026</div>
          <div style={{ fontFamily: display, fontSize: 168, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.05em', color: C.text, transform: `translateY(${(1 - date) * 60}px)`, opacity: date }}>
            JAN <span style={{ color: C.orange }}>15</span>
          </div>
          <div style={{ opacity: ease(f, tBan, tBan + 12) }}>
            <Kinetic text="X bans every app that pays people to post." delay={tBan} size={54} weight={600} highlight={['bans']} />
          </div>
          <div style={{ marginTop: 10, opacity: ease(f, tKaito, tKaito + 10), display: 'flex', alignItems: 'center', gap: 24 }}>
            <svg width={520} height={160} style={{ overflow: 'visible' }}>
              <polyline points={pts.slice(0, shown).join(' ')} fill="none" stroke={shown > 19 ? C.red : C.muted} strokeWidth={4} strokeLinejoin="round" />
            </svg>
            <div style={{ fontFamily: mono, fontSize: 44, color: C.red, fontWeight: 600, opacity: ease(f, tKaito + 30, tKaito + 40) }}>KAITO −20%</div>
          </div>
        </div>
        <div style={{ width: 620, position: 'relative', transform: `translateX(${shake}px)` }}>
          <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, letterSpacing: '0.14em', marginBottom: 14 }}>YAPS · TOP POSTS</div>
          {POSTS.map((p, i) => {
            const s = useSpring(10 + i * 6);
            const fall = collapse * (120 + i * 70);
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', marginBottom: 14, borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, opacity: s * (1 - collapse * 0.9), transform: `translateY(${(1 - s) * 40 + fall}px) rotate(${collapse * (i % 2 ? 8 : -6)}deg)`, fontFamily: body, color: C.text, fontSize: 24 }}>
                <Identicon seed={p} size={44} />
                <span style={{ flex: 1 }}>{p}</span>
                <span style={{ fontFamily: mono, fontSize: 20, color: f > tBan + 8 ? C.faint : C.green, textDecoration: f > tBan + 8 ? 'line-through' : 'none' }}>+{12 + i * 7} yaps</span>
              </div>
            );
          })}
          <div style={{ position: 'absolute', top: 160, left: -30, right: -30, textAlign: 'center', transform: `rotate(-8deg) scale(${2.2 - 1.2 * stamp})`, opacity: stamp, border: `6px solid ${C.red}`, borderRadius: 18, padding: '18px 10px', fontFamily: display, fontWeight: 700, fontSize: 64, color: C.red, background: 'rgba(30,8,8,0.82)', letterSpacing: '0.02em' }}>
            API ACCESS REVOKED
          </div>
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fadeAll }}>
        <Kinetic text="One API decision." delay={tOne} size={120} highlight={['api']} style={{ justifyContent: 'center' }} />
        <div style={{ marginTop: 26, opacity: interpolate(f, [tOne + 30, tOne + 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Kinetic text="A whole category, gone." delay={tOne + 30} size={56} color={C.muted} weight={500} style={{ justifyContent: 'center' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
