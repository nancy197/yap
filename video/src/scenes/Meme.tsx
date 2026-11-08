import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, display, body, Kinetic, ease, Caps, short, grad } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

export function Meme() {
  const f = useCurrentFrame();
  const tTarget = cue('meme', 'target');
  const tLoud = cue('meme', 'loud');
  const tQuiet = cue('meme', 'quiet');
  const tSilence = cue('meme', 'silence');
  const tNobody = cue('meme', 'nobody');
  const phase = f < tLoud ? 'idle' : f < tQuiet ? 'loud' : f < tSilence ? 'quiet' : 'dead';
  // Gauge: attention vs a target that drifts (EMA).
  const target = 0.55 + Math.sin(f / 40) * 0.03;
  const att = interpolate(f, [tTarget - 10, tLoud, tLoud + 30, tQuiet, tQuiet + 20, tSilence, tSilence + 15], [0.2, 0.5, 0.86, 0.86, 0.3, 0.3, 0.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const col = phase === 'loud' ? C.orange : phase === 'quiet' ? C.blue : phase === 'dead' ? C.red : C.violet;
  const streak = phase === 'loud' ? Math.min(3, 1 + Math.floor((f - tLoud) / 18)) : 0;
  const reserve = interpolate(f, [tQuiet + 10, tQuiet + 40, tSilence + 8, tSilence + 40], [600000, 582000, 582000, 523800], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lockIn = ease(f, tNobody - 4, tNobody + 18);
  const loudEmission = data.epochs.find((e: any) => Number(e.emission) > 800e18)?.emission;
  const mintShown = loudEmission ? Number(BigInt(loudEmission) / 10n ** 15n) / 1000 : 872.9;
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      <div style={{ opacity: 1 - lockIn * 0.9, transform: `translateY(${-lockIn * 40}px)` }}>
        <Kinetic text="The meme: supply follows attention." size={62} delay={4} highlight={['supply', 'attention']} />
        {/* gauge */}
        <div style={{ position: 'relative', marginTop: 70, height: 70, borderRadius: 35, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${att * 100}%`, borderRadius: 35, background: `linear-gradient(90deg, ${C.violet}, ${col})`, boxShadow: `0 0 50px ${col}55` }} />
          <div style={{ position: 'absolute', left: `${target * 100}%`, top: -22, bottom: -22, width: 4, background: C.text, opacity: ease(f, tTarget, tTarget + 10) }} />
          <div style={{ position: 'absolute', left: `${target * 100}%`, top: -60, transform: 'translateX(-50%)', fontFamily: mono, fontSize: 22, color: C.muted, opacity: ease(f, tTarget, tTarget + 10), whiteSpace: 'nowrap' }}>moving target (EMA)</div>
          <div style={{ position: 'absolute', left: 24, top: 18, fontFamily: mono, fontSize: 26, color: C.text, fontWeight: 600 }}>attention</div>
        </div>
        <div style={{ display: 'flex', gap: 40, marginTop: 60, alignItems: 'stretch' }}>
          {/* outcome card */}
          <div style={{ flex: 1.2, borderRadius: 28, padding: 34, border: `2px solid ${col}`, background: `${col}12`, minHeight: 330, transition: 'none' }}>
            <div style={{ fontFamily: display, fontSize: 84, fontWeight: 700, color: col, lineHeight: 1 }}>
              {phase === 'idle' ? '…' : phase === 'loud' ? 'LOUD 🔥' : phase === 'quiet' ? 'QUIET 🧊' : 'SILENCE ☠'}
            </div>
            <div style={{ fontFamily: body, fontSize: 32, color: C.text, marginTop: 18 }}>
              {phase === 'loud' && <>mint up to 3× base + streak bonus · <span style={{ fontFamily: mono, color: C.amber }}>+{mintShown.toLocaleString('en-US')} YAP</span> on testnet</>}
              {phase === 'quiet' && <>streak resets · burn <b style={{ color: C.blue }}>3%</b> of the Reserve</>}
              {phase === 'dead' && <>no report · burn <b style={{ color: C.red }}>10%</b> of the Reserve</>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} style={{ width: 34, height: 44, borderRadius: '8px 8px 18px 18px', background: i < streak ? grad : 'rgba(255,255,255,0.08)', boxShadow: i < streak ? `0 0 24px ${C.orange}` : 'none', transform: i < streak ? `scale(${1 + Math.sin((f + i * 5) / 4) * 0.05})` : 'none' }} />
              ))}
              <span style={{ fontFamily: mono, fontSize: 24, color: C.muted, alignSelf: 'center', marginLeft: 10 }}>streak {streak} · +{Math.min(streak, 10) * 5}%</span>
            </div>
          </div>
          {/* reserve */}
          <div style={{ flex: 1, borderRadius: 28, padding: 34, background: 'rgba(26,25,32,0.78)', border: `1px solid ${C.border}` }}>
            <Caps>Reserve</Caps>
            <div style={{ fontFamily: mono, fontSize: 70, fontWeight: 600, color: C.text, marginTop: 8 }}>{Math.round(reserve).toLocaleString('en-US')}</div>
            <div style={{ height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.06)', marginTop: 20, overflow: 'hidden' }}>
              <div style={{ width: `${(reserve / 600000) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.violet}, ${C.amber})` }} />
            </div>
            {/* embers when burning */}
            {(phase === 'quiet' || phase === 'dead') &&
              Array.from({ length: 14 }, (_, i) => {
                const t = ((f + i * 11) % 40) / 40;
                return <div key={i} style={{ position: 'absolute', marginLeft: 40 + ((i * 47) % 380), marginTop: -t * 120, width: 7, height: 7, borderRadius: 4, background: phase === 'dead' ? C.red : C.orange, opacity: 1 - t }} />;
              })}
            <div style={{ fontFamily: mono, fontSize: 24, color: C.muted, marginTop: 30 }}>unclaimed rewards burn after 14 epochs</div>
          </div>
        </div>
      </div>
      {/* the real $YAP page: streak, supply, and the "no admin key" proof */}
      <AbsoluteFill style={{ opacity: lockIn }}>
        <Sequence from={tNobody - 12} layout="none">
          <BrowserClip src="token" from={80} width={1500} style={{ position: 'absolute', left: 210, top: 150 }} cams={[{ at: 0, zoom: 1.0, x: 0.5, y: 0.4 }, { at: 40, zoom: 1.0, x: 0.5, y: 0.4 }, { at: 100, zoom: 1.7, x: 0.83, y: 0.47 }]} />
        </Sequence>
        <div style={{ position: 'absolute', left: 120, bottom: 150, display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(14,13,18,0.94)', border: `1px solid ${C.border}`, borderRadius: 22, padding: '18px 28px', opacity: ease(f, tNobody + 40, tNobody + 55) }}>
          <svg width={54} height={62} viewBox="0 0 24 28"><path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke={C.amber} strokeWidth={2.2} /><rect x={3} y={12} width={18} height={14} rx={3} fill={C.orange} /><circle cx={12} cy={19} r={2} fill="#1a0f06" /></svg>
          <div><div style={{ fontFamily: display, fontSize: 44, fontWeight: 700, color: C.text }}>0 access keys</div><div style={{ fontFamily: mono, fontSize: 18, color: C.faint }}>{data.token} · tx {short(data.tx.deploy.at(-1)?.hash ?? '9L4itgrorJWk2NZ128RUK9PtaFqHNieRnv15CrHHm28A', 8)}</div></div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
