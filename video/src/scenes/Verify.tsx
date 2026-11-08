import { AbsoluteFill, useCurrentFrame, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, display, body, Kinetic, ease } from '../ui/kit';
import { cue } from '../timeline';

const ROOT = '6c153356945f32c76d0537c196919e2bfe9f4da3f6b771b887636206635bfb20';
const CHECKS = ['Dataset hash matches its content', 'On-chain report exists · 2 signatures', 'data_hash on chain = recomputed', 'labels_hash on chain = recomputed', 'Recomputed every score in this browser', 'Attention = published', 'Yappers root = published', 'Yappers root = on chain', 'Attention = on chain'];

export function Verify() {
  const f = useCurrentFrame();
  const tPick = cue('verify', 'pick');
  const tMs = cue('verify', 'milliseconds');
  const tChain = cue('verify', 'chain');
  const lock = ease(f, tChain - 10, tChain + 20);
  const scramble = (s: string, p: number) => s.split('').map((c, i) => (i / s.length < p ? c : '0123456789abcdef'[(i * 7 + f) % 16])).join('');
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      <Kinetic text="Don't trust us. Verify in your browser." size={58} delay={2} highlight={['verify']} />
      <div style={{ display: 'flex', gap: 40, marginTop: 50 }}>
        <Sequence from={tPick - 25} layout="none">
          <BrowserClip src="verify" from={50} width={1120} tilt={false} cams={[{ at: 0, zoom: 1.25, x: 0.38, y: 0.32 }, { at: 70, zoom: 1.5, x: 0.36, y: 0.6 }]} />
        </Sequence>
        <div style={{ flex: 1, display: 'grid', gap: 30, alignContent: 'start' }}>
          <div style={{ opacity: ease(f, tMs - 6, tMs + 6) }}>
            <div style={{ fontFamily: mono, fontSize: 24, color: C.muted }}>recompute time</div>
            <div style={{ fontFamily: display, fontSize: 150, fontWeight: 700, color: C.amber, lineHeight: 1 }}>9 ms</div>
          </div>
          <div style={{ opacity: ease(f, tChain - 14, tChain) }}>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.muted }}>Merkle root · on chain</div>
            <div style={{ fontFamily: mono, fontSize: 22, color: C.text, wordBreak: 'break-all' }}>{ROOT}</div>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, marginTop: 14 }}>recomputed here</div>
            <div style={{ fontFamily: mono, fontSize: 22, color: lock >= 1 ? C.green : C.amber, wordBreak: 'break-all' }}>{scramble(ROOT, lock)}</div>
            <div style={{ fontFamily: display, fontSize: 54, fontWeight: 700, color: C.green, marginTop: 16, opacity: lock >= 1 ? 1 : 0 }}>MATCH ✓</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
