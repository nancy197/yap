import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C, mono, display, body, Kinetic, ease, short, Caps } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

export function Trust() {
  const f = useCurrentFrame();
  const tTwo = cue('trust', 'two');
  const tCheat = cue('trust', 'cheat');
  const tWatch = cue('trust', 'watchdog');
  const tChal = cue('trust', 'challenged');
  const tDao = cue('trust', 'sputnik');
  const tUp = cue('trust', 'upheld');
  const tLost = cue('trust', 'lost');
  const tHonest = cue('trust', 'honest');
  const cheat = f >= tCheat + 6;
  const scan = interpolate(f, [tWatch, tWatch + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const mismatch = ease(f, tWatch + 30, tWatch + 40);
  const toCourt = ease(f, tDao - 6, tDao + 16);
  const votes = [tUp - 8, tUp + 4];
  const slash = ease(f, tLost, tLost + 30);
  const honest = ease(f, tHonest, tHonest + 14);
  const txs = [...data.tx.tampered, ...data.tx.challenge, ...data.tx.vote, ...data.tx.resubmit];
  const Scorer = ({ i }: { i: number }) => {
    const bad = cheat && i < 2;
    const s = ease(f, 6 + i * 6, 20 + i * 6);
    const bond = bad ? 1000 * (1 - slash) : 1000;
    return (
      <div style={{ width: 360, borderRadius: 26, padding: 26, background: 'rgba(26,25,32,0.85)', border: `2px solid ${bad ? C.red : i === 2 && honest > 0 ? C.green : C.border}`, opacity: s, transform: `translateY(${(1 - s) * 40}px)`, boxShadow: bad ? `0 0 40px ${C.red}44` : 'none' }}>
        <Caps>scorer-{i + 1}</Caps>
        <div style={{ fontFamily: mono, fontSize: 26, color: C.muted, marginTop: 10 }}>bond <span style={{ color: bad && slash > 0 ? C.red : C.text }}>{Math.round(bond).toLocaleString('en-US')} YAP</span></div>
        <div style={{ marginTop: 18, fontFamily: mono, fontSize: 22, color: C.muted }}>report</div>
        <div style={{ fontFamily: mono, fontSize: 30, color: bad ? C.red : C.text }}>attention {bad ? '89.9' : '70.1'}</div>
        <div style={{ fontFamily: mono, fontSize: 18, color: C.faint }}>root {bad ? 'b81f…22aa' : '6c15…5b20'}</div>
        {i === 2 && honest > 0 && <div style={{ marginTop: 14, fontFamily: mono, fontSize: 24, color: C.green, opacity: honest }}>✓ FINALIZED</div>}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      <div style={{ opacity: 1 - toCourt * 0.9 }}>
        <Kinetic text="Two of three bonded scorers must agree." size={56} delay={4} highlight={['two', 'three']} />
      </div>
      <div style={{ position: 'absolute', left: 110, top: 290, display: 'flex', gap: 40, transform: `scale(${1 - toCourt * 0.4}) translate(0px, ${toCourt * 260}px)`, transformOrigin: 'left top' }}>
        {[0, 1, 2].map((i) => <Scorer key={i} i={i} />)}
      </div>
      <div style={{ position: 'absolute', left: 110, top: 270, opacity: ease(f, tTwo, tTwo + 10) * (1 - toCourt), fontFamily: mono, fontSize: 22, color: C.orange }}>quorum 2 / 3 · identical report hash</div>
      {/* watchdog scan */}
      {f > tWatch && toCourt < 1 && (
        <div style={{ position: 'absolute', left: 110 + scan * 1080, top: 560, width: 120, height: 120, borderRadius: '50%', border: `6px solid ${C.amber}`, boxShadow: `0 0 40px ${C.amber}88`, opacity: 1 - toCourt }}>
          <div style={{ position: 'absolute', right: -40, bottom: -30, width: 60, height: 12, background: C.amber, transform: 'rotate(45deg)', borderRadius: 6 }} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 230, top: 760, opacity: mismatch * (1 - toCourt), transform: `scale(${1.6 - mismatch * 0.6}) rotate(-4deg)`, fontFamily: display, fontWeight: 700, fontSize: 56, color: C.red, border: `5px solid ${C.red}`, borderRadius: 14, padding: '6px 24px', background: 'rgba(30,8,8,0.85)' }}>
        WATCHDOG: 70.1 ≠ 89.9
      </div>
      <div style={{ position: 'absolute', left: 900, top: 780, opacity: ease(f, tChal, tChal + 10) * (1 - toCourt), fontFamily: mono, fontSize: 28, color: C.amber }}>→ challenge · bonds 500 YAP</div>
      {/* the court */}
      <div style={{ position: 'absolute', right: 110, top: 250, width: 900, opacity: toCourt, transform: `translateX(${(1 - toCourt) * 120}px)` }}>
        <div style={{ borderRadius: 30, padding: 36, background: 'rgba(26,25,32,0.88)', border: `1px solid ${C.border}` }}>
          <Caps>Sputnik DAO · {data.dao}</Caps>
          <div style={{ fontFamily: display, fontSize: 46, fontWeight: 700, marginTop: 10, color: C.text }}>Proposal #5 — opened by the token contract</div>
          <div style={{ fontFamily: mono, fontSize: 26, color: C.muted, marginTop: 10 }}>resolve_challenge(e: 3, upheld: true)</div>
          <div style={{ display: 'flex', gap: 22, marginTop: 30 }}>
            {['yap-hq', 'council-1', 'council-2'].map((c, i) => {
              const v = i < 2 && f > votes[i]!;
              return (
                <div key={c} style={{ flex: 1, borderRadius: 18, padding: 18, border: `2px solid ${v ? C.green : C.border}`, fontFamily: mono, fontSize: 22, color: v ? C.green : C.muted, textAlign: 'center', transform: v ? `scale(${1 + Math.max(0, 1 - (f - votes[i]!) / 8) * 0.12})` : 'none' }}>
                  {c}<div style={{ fontSize: 40, marginTop: 6 }}>{v ? '✓' : '·'}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 26, fontFamily: display, fontSize: 40, fontWeight: 700, color: f > tUp + 10 ? C.green : C.faint }}>{f > tUp + 10 ? 'UPHELD · report discarded' : 'voting…'}</div>
          <div style={{ marginTop: 22, display: 'grid', gap: 10, fontFamily: mono, fontSize: 26, opacity: slash }}>
            <div style={{ color: C.red }}>− 2,000 YAP slashed from the two cheaters</div>
            <div style={{ color: C.green }}>+ 1,500 YAP to the watchdog (bond back + half the slash)</div>
            <div style={{ color: C.orange }}>🔥 1,000 YAP burned</div>
          </div>
        </div>
      </div>
      {/* coins */}
      {slash > 0 && slash < 1 &&
        Array.from({ length: 10 }, (_, i) => {
          const t = (slash * 1.4 + i * 0.07) % 1;
          return <div key={i} style={{ position: 'absolute', left: 260 + i * 30 + t * 900, top: 600 - Math.sin(t * Math.PI) * 220, width: 26, height: 26, borderRadius: 13, background: C.amber, boxShadow: `0 0 16px ${C.amber}` }} />;
        })}
      {/* tx ticker */}
      <div style={{ position: 'absolute', left: 110, right: 110, bottom: 140, display: 'flex', gap: 18, overflow: 'hidden', opacity: ease(f, tCheat, tCheat + 20) }}>
        {txs.map((t, i) => (
          <div key={t.hash} style={{ fontFamily: mono, fontSize: 17, color: C.faint, whiteSpace: 'nowrap', transform: `translateX(${-((f * 1.5) % 400)}px)`, opacity: ease(f, tCheat + i * 12, tCheat + i * 12 + 10) }}>
            {t.action.replace(/ \(.*\)$/, '').replace('submit_report', 'report')} · {short(t.hash, 6)}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
