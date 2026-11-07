import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, mono, display, body, Kinetic, ease, Identicon, Caps, grad } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

export function Proof() {
  const f = useCurrentFrame();
  const tSixty = cue('proof', 'sixty');
  const tSpam = cue('proof', 'eightyseven');
  const tSilent = cue('proof', 'silent');
  const toSim = ease(f, tSixty - 6, tSixty + 14);
  const max = data.mainnet.yappers[0]!.share;
  const W = 820, H = 380;
  const line = (arr: number[], top: number, p: number, color: string) => {
    const n = Math.max(2, Math.round(arr.length * p));
    const pts = arr.slice(0, n).map((v, i) => `${(i / (arr.length - 1)) * W},${H - (v / top) * H}`).join(' ');
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" />;
  };
  const draw = ease(f, tSixty, tSixty + 60);
  const morph = ease(f, tSpam - 10, tSpam + 25);
  const top = Math.max(...data.sim.steady, ...data.sim.hype);
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      {/* mainnet */}
      <div style={{ opacity: 1 - toSim, transform: `translateX(${-toSim * 160}px)` }}>
        <Kinetic text="Already ranking real near.social mainnet." size={56} delay={2} highlight={['real', 'mainnet']} />
        <div style={{ display: 'flex', gap: 50, marginTop: 40 }}>
          <div style={{ width: 1100, display: 'grid', gap: 12 }}>
            {data.mainnet.yappers.slice(0, 8).map((y, i) => {
              const s = ease(f, 10 + i * 4, 24 + i * 4);
              return (
                <div key={y.account} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: s, transform: `translateX(${(1 - s) * 60}px)` }}>
                  <span style={{ fontFamily: mono, fontSize: 24, color: C.muted, width: 34 }}>{i + 1}</span>
                  <Identicon seed={y.account} size={44} />
                  <span style={{ fontFamily: body, fontSize: 26, color: C.text, width: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{y.account.length > 30 ? `${y.account.slice(0, 10)}…${y.account.slice(-6)}` : y.account}</span>
                  <div style={{ flex: 1, height: 18, borderRadius: 9, background: 'rgba(255,255,255,.06)' }}><div style={{ width: `${(y.share / max) * 100 * s}%`, height: '100%', borderRadius: 9, background: grad }} /></div>
                  <span style={{ fontFamily: mono, fontSize: 24, color: C.text, width: 100, textAlign: 'right' }}>{(y.share * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
            {[[data.mainnet.count, 'yappers'], [data.mainnet.posts, 'posts · 30 days'], ['TEE', 'AI labels'], ['0', 'YAP paid (read-only)']].map(([v, k]) => (
              <div key={k as string}><div style={{ fontFamily: display, fontSize: 64, fontWeight: 700, color: C.amber }}>{v}</div><Caps>{k}</Caps></div>
            ))}
          </div>
        </div>
      </div>
      {/* simulation */}
      <AbsoluteFill style={{ padding: '140px 110px', opacity: toSim, transform: `translateX(${(1 - toSim) * 160}px)` }}>
        <Kinetic text="60 simulated epochs, real scoring code." size={56} delay={tSixty} highlight={['60']} />
        <div style={{ display: 'flex', gap: 60, marginTop: 50 }}>
          <div>
            <svg width={W} height={H} style={{ overflow: 'visible' }}>
              {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={0} x2={W} y1={H - g * H} y2={H - g * H} stroke="rgba(255,255,255,.07)" />)}
              {line(data.sim.steady, top, draw, C.blue)}
              {line(data.sim.hype, top, draw, C.violet)}
              {line(data.sim.deadSupply, top, draw, C.red)}
            </svg>
            <div style={{ display: 'flex', gap: 30, marginTop: 18, fontFamily: mono, fontSize: 22 }}>
              <span style={{ color: C.blue }}>— steady</span><span style={{ color: C.violet }}>— hype then fade</span><span style={{ color: C.red, opacity: ease(f, tSilent - 10, tSilent) }}>— silent meme eats its reserve</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'grid', gap: 34, alignContent: 'start' }}>
            {[['100-bot spam farm', data.sim.spam.none, data.sim.spam.all], ['10-account like ring', data.sim.ring.none, data.sim.ring.all]].map(([k, a, b]) => {
              const v = (a as number) + ((b as number) - (a as number)) * morph;
              return (
                <div key={k as string}>
                  <div style={{ fontFamily: body, fontSize: 28, color: C.text }}>{k}: share of rewards</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 10 }}>
                    <div style={{ flex: 1, height: 34, borderRadius: 17, background: 'rgba(255,255,255,.06)' }}><div style={{ width: `${v * 100}%`, height: '100%', borderRadius: 17, background: morph > 0.5 ? C.green : C.red }} /></div>
                    <span style={{ fontFamily: mono, fontSize: 44, color: C.text, width: 140 }}>{(v * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
            <Caps>all defences on · no defences → real scorer</Caps>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
